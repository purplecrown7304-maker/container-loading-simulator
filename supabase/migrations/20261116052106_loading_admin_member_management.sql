-- Existing opaque administrator sessions are the only authority for this RPC.
-- A browser-supplied user ID, company role, password or token hash is insufficient:
-- only the service-role Edge Function can execute it, and the session is rechecked
-- in the same transaction as the member read/update.
create function public.loading_admin_member_action(
  p_admin_token_hash text,
  p_op text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_admin_expires_at timestamptz;
  v_query text;
  v_pattern text;
  v_status text;
  v_page integer;
  v_member_id uuid;
  v_display_name text;
  v_expected_updated_at timestamptz;
  v_member record;
  v_result jsonb;
begin
  if p_admin_token_hash is null or p_admin_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'admin_auth_required';
  end if;
  -- Logout/delete must wait for an in-flight operation; a revoked/expired token
  -- cannot start a new operation. Do not update session expiry while listing.
  select expires_at into v_admin_expires_at
    from public.app_admin_upload_sessions
    where token_sha256 = p_admin_token_hash and expires_at > clock_timestamp()
    for share;
  if v_admin_expires_at is null or v_admin_expires_at <= clock_timestamp() then raise exception 'admin_auth_required'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
    or octet_length(p_payload::text) > 4096 then raise exception 'invalid_request'; end if;

  if p_op = 'list' then
    if p_payload ? 'q' and (jsonb_typeof(p_payload->'q') <> 'string' or char_length(p_payload->>'q') > 100) then
      raise exception 'invalid_request';
    end if;
    v_query := btrim(coalesce(p_payload->>'q',''));
    v_status := coalesce(p_payload->>'status','all');
    if p_payload ? 'status' and jsonb_typeof(p_payload->'status') <> 'string'
      or v_status not in ('all','active','suspended') then raise exception 'invalid_member_status'; end if;
    if p_payload ? 'page' and (jsonb_typeof(p_payload->'page') <> 'number'
      or (p_payload->>'page') !~ '^[0-9]{1,6}$') then raise exception 'invalid_request'; end if;
    v_page := coalesce((p_payload->>'page')::integer,1);
    if v_page < 1 or v_page > 100000 then raise exception 'invalid_request'; end if;
    if p_payload ? 'pageSize' and (jsonb_typeof(p_payload->'pageSize') <> 'number'
      or p_payload->>'pageSize' <> '25') then raise exception 'invalid_request'; end if;
    -- User input is a literal substring, never an ILIKE wildcard expression.
    v_pattern := '%' || replace(replace(replace(v_query, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%';
    with filtered as materialized (
      select id,email,display_name,status,created_at,updated_at,last_login_at
      from public.loading_members
      where (v_status='all' or status=v_status)
        and (v_query='' or email ilike v_pattern escape E'\\' or display_name ilike v_pattern escape E'\\')
    ), page_rows as (
      select * from filtered order by created_at desc,id desc offset (v_page-1)*25 limit 25
    )
    select jsonb_build_object(
      'members',coalesce(jsonb_agg(jsonb_build_object(
        'id',id,'email',email,'displayName',display_name,'status',status,
        'createdAt',created_at,'updatedAt',updated_at,'lastLoginAt',last_login_at
      ) order by created_at desc,id desc),'[]'::jsonb),
      'total',(select count(*) from filtered),'page',v_page,'pageSize',25
    ) into v_result from page_rows;
    return v_result;
  elsif p_op = 'update' then
    if jsonb_typeof(p_payload->'memberId') is distinct from 'string'
      or (p_payload->>'memberId') !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then
      raise exception 'invalid_member_id';
    end if;
    v_member_id := (p_payload->>'memberId')::uuid;
    if jsonb_typeof(p_payload->'displayName') is distinct from 'string' then raise exception 'invalid_display_name'; end if;
    v_display_name := btrim(p_payload->>'displayName');
    if char_length(v_display_name) not between 1 and 60 then raise exception 'invalid_display_name'; end if;
    v_status := p_payload->>'status';
    if jsonb_typeof(p_payload->'status') is distinct from 'string'
      or v_status not in ('active','suspended') then raise exception 'invalid_member_status'; end if;
    if jsonb_typeof(p_payload->'expectedUpdatedAt') is distinct from 'string'
      or char_length(p_payload->>'expectedUpdatedAt') > 40
      or (p_payload->>'expectedUpdatedAt') !~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]([.][0-9]{1,6})?(Z|[+-](0[0-9]|1[0-4]):[0-5][0-9])$' then
      raise exception 'invalid_request';
    end if;
    begin
      v_expected_updated_at := (p_payload->>'expectedUpdatedAt')::timestamptz;
    exception when others then raise exception 'invalid_request';
    end;
    select id,email,display_name,status,created_at,updated_at,last_login_at into v_member
      from public.loading_members where id=v_member_id for update;
    if not found then raise exception 'admin_member_not_found'; end if;
    if v_member.updated_at is distinct from v_expected_updated_at then raise exception 'admin_member_conflict'; end if;
    if v_member.status is distinct from v_status then
      -- Revoke on both suspension and reactivation: old sessions never revive.
      delete from public.loading_member_sessions where member_id=v_member_id;
    end if;
    update public.loading_members
      set display_name=v_display_name,status=v_status,updated_at=clock_timestamp()
      where id=v_member_id
      returning id,email,display_name,status,created_at,updated_at,last_login_at into v_member;
    return jsonb_build_object('member',jsonb_build_object(
      'id',v_member.id,'email',v_member.email,'displayName',v_member.display_name,'status',v_member.status,
      'createdAt',v_member.created_at,'updatedAt',v_member.updated_at,'lastLoginAt',v_member.last_login_at
    ));
  end if;
  raise exception 'invalid_request';
end;
$$;

revoke all on function public.loading_admin_member_action(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.loading_admin_member_action(text,text,jsonb) to service_role;
-- SECURITY INVOKER needs explicit existing-table privileges, including UPDATE
-- on one administrator-session column for SELECT ... FOR SHARE.
grant select(id,token_sha256,expires_at),update(expires_at) on public.app_admin_upload_sessions to service_role;
grant select(id,email,display_name,status,created_at,updated_at,last_login_at),
  update(display_name,status,updated_at) on public.loading_members to service_role;
grant select(member_id),delete on public.loading_member_sessions to service_role;
comment on function public.loading_admin_member_action(text,text,jsonb) is
  'Server-only member directory/profile/status management. Revalidates an opaque administrator session and atomically revokes sessions on status changes.';
