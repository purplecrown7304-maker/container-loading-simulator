-- Opaque member sessions are verified by container-member-api, not Supabase Auth.
-- No browser roles may access these tables or impersonate the RPC actor.
create table public.loading_company_spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now()
);
create table public.loading_company_members (
  company_id uuid not null references public.loading_company_spaces on delete cascade,
  member_id uuid not null references public.loading_members on delete restrict,
  role text not null check (role in ('owner','admin','planner','approver','viewer')),
  primary key(company_id,member_id)
);
create index loading_company_members_actor_idx on public.loading_company_members(member_id);
create table public.loading_company_invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.loading_company_spaces on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  email text not null check (char_length(email) between 3 and 254),
  role text not null check (role in ('planner','approver','viewer')),
  created_by uuid not null references public.loading_members on delete restrict,
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz
);
create index loading_company_invites_company_idx on public.loading_company_invites(company_id);
create table public.loading_company_plans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.loading_company_spaces on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  status text not null default 'draft' check (status in ('draft','submitted','approved','changes_requested')),
  revision integer not null default 1 check (revision > 0),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object' and octet_length(snapshot::text) <= 4000000),
  created_by uuid not null references public.loading_members on delete restrict,
  submitted_by uuid references public.loading_members on delete restrict,
  updated_at timestamptz not null default now()
);
create index loading_company_plans_company_idx on public.loading_company_plans(company_id,updated_at desc);
create table public.loading_company_versions (
  plan_id uuid not null references public.loading_company_plans on delete cascade,
  revision integer not null,
  snapshot jsonb not null,
  title text not null,
  created_by uuid not null references public.loading_members on delete restrict,
  created_at timestamptz not null default now(),
  primary key(plan_id,revision)
);
create table public.loading_company_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.loading_company_spaces on delete cascade,
  plan_id uuid references public.loading_company_plans on delete cascade,
  actor_id uuid not null references public.loading_members on delete restrict,
  action text not null,
  revision integer,
  comment text check (char_length(comment) <= 1000),
  created_at timestamptz not null default now()
);
create index loading_company_events_company_idx on public.loading_company_events(company_id,created_at desc);
create index loading_company_events_plan_idx on public.loading_company_events(plan_id);
create index loading_company_versions_actor_idx on public.loading_company_versions(created_by);
create index loading_company_events_actor_idx on public.loading_company_events(actor_id);
create index loading_company_plans_creator_idx on public.loading_company_plans(created_by);
create index loading_company_plans_submitter_idx on public.loading_company_plans(submitted_by);
create index loading_company_invites_creator_idx on public.loading_company_invites(created_by);

alter table public.loading_company_spaces enable row level security;
alter table public.loading_company_members enable row level security;
alter table public.loading_company_invites enable row level security;
alter table public.loading_company_plans enable row level security;
alter table public.loading_company_versions enable row level security;
alter table public.loading_company_events enable row level security;
revoke all on public.loading_company_spaces, public.loading_company_members, public.loading_company_invites,
  public.loading_company_plans, public.loading_company_versions, public.loading_company_events from public, anon, authenticated;
grant select,insert,update,delete on public.loading_company_spaces, public.loading_company_members, public.loading_company_invites,
  public.loading_company_plans, public.loading_company_versions, public.loading_company_events to service_role;

-- Each call is one transaction. Lock the company before membership/plan changes
-- so revocation cannot race a write; expectedRevision also covers status changes.
create function public.loading_company_reviewable(s jsonb)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
begin
  if s#>>'{recordedVerification,status}' is distinct from 'passed' or
    s#>'{container,limitReview}' is not null or s#>'{result,limitReview}' is not null or
    jsonb_typeof(s->'cargo') is distinct from 'array' or jsonb_array_length(s->'cargo')=0 or
    jsonb_typeof(s#>'{result,placements}') is distinct from 'array' or
    jsonb_typeof(s#>'{result,remaining}') is distinct from 'array' or
    jsonb_typeof(s#>'{result,validationIssues}') is distinct from 'array' then return false; end if;
  if jsonb_array_length(s#>'{result,placements}')=0 or jsonb_array_length(s#>'{result,validationIssues}')<>0 then return false; end if;
  if exists(select 1 from jsonb_array_elements(coalesce(s#>'{result,operationalFindings}','[]'::jsonb)) f where f->>'severity'='error') then return false; end if;
  if exists(select 1 from jsonb_array_elements(s->'cargo') c group by c->>'id' having c->>'id' is null or count(*)>1) then return false; end if;
  if exists(select 1 from jsonb_array_elements(s#>'{result,placements}') p where p->>'cargoId' is null or
    not exists(select 1 from jsonb_array_elements(s->'cargo') c where c->>'id'=p->>'cargoId')) then return false; end if;
  if exists(select 1 from jsonb_array_elements(s#>'{result,remaining}') p where p->>'cargoId' is null or
    not exists(select 1 from jsonb_array_elements(s->'cargo') c where c->>'id'=p->>'cargoId') or
    (p->>'quantity')::numeric is null or (p->>'quantity')::numeric<0 or (p->>'quantity')::numeric<>trunc((p->>'quantity')::numeric)) then return false; end if;
  if exists(select 1 from jsonb_array_elements(s#>'{result,placements}') p where p->>'unitId' is not null group by p->>'unitId' having count(*)>1) then return false; end if;
  if exists(select 1 from jsonb_array_elements(s->'cargo') c where
    (c->>'quantity')::numeric is null or (c->>'quantity')::numeric<0 or
    (c->>'quantity')::numeric<>(select count(*) from jsonb_array_elements(s#>'{result,placements}') p where p->>'cargoId'=c->>'id') +
      coalesce((select sum((p->>'quantity')::numeric) from jsonb_array_elements(s#>'{result,remaining}') p where p->>'cargoId'=c->>'id'),0)) then return false; end if;
  return true;
exception when others then return false;
end;
$$;
revoke all on function public.loading_company_reviewable(jsonb) from public,anon,authenticated;
grant execute on function public.loading_company_reviewable(jsonb) to service_role;

create function public.loading_company_action(p_actor uuid, p_op text, p_payload jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_company uuid;
  v_role text;
  v_space public.loading_company_spaces;
  v_plan public.loading_company_plans;
  v_invite public.loading_company_invites;
  v_target_role text;
  v_title text;
  v_out jsonb;
  v_action text;
  v_offset integer;
begin
  if not exists(select 1 from public.loading_members where id=p_actor and status='active') then
    raise exception 'company_forbidden';
  end if;
  if p_op='list' then
    return jsonb_build_object('spaces',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'role',m.role) order by s.name,s.id)
      from public.loading_company_spaces s join public.loading_company_members m on m.company_id=s.id where m.member_id=p_actor),'[]'::jsonb));
  elsif p_op='create' then
    v_title := btrim(p_payload->>'name');
    if v_title is null or char_length(v_title) not between 1 and 80 then raise exception 'company_invalid'; end if;
    if (select count(*) from public.loading_company_members where member_id=p_actor and role='owner')>=20 then raise exception 'company_invalid'; end if;
    insert into public.loading_company_spaces(name) values(v_title) returning * into v_space;
    insert into public.loading_company_members values(v_space.id,p_actor,'owner');
    insert into public.loading_company_events(company_id,actor_id,action) values(v_space.id,p_actor,'company_created');
    return jsonb_build_object('id',v_space.id,'name',v_space.name,'role','owner');
  elsif p_op='accept' then
    select * into v_invite from public.loading_company_invites where token_hash=p_payload->>'inviteHash';
    if not found then raise exception 'company_invite_invalid'; end if;
    v_company:=v_invite.company_id;
  else
    v_company := (p_payload->>'companyId')::uuid;
  end if;
  select * into v_space from public.loading_company_spaces where id=v_company for update;
  if not found then raise exception 'company_forbidden'; end if;
  if not exists(select 1 from public.loading_members where id=p_actor and status='active') then raise exception 'company_forbidden'; end if;
  if p_op='accept' then
    select * into v_invite from public.loading_company_invites where id=v_invite.id for update;
    if v_invite.used_at is not null or v_invite.expires_at<=now() or
      v_invite.email<>(select lower(email) from public.loading_members where id=p_actor) or
      not exists(select 1 from public.loading_company_members where company_id=v_company and member_id=v_invite.created_by and role in ('owner','admin')) then
      raise exception 'company_invite_invalid';
    end if;
    -- An invitation never elevates an existing member or the owner.
    if exists(select 1 from public.loading_company_members where company_id=v_company and member_id=p_actor) then raise exception 'company_invite_invalid'; end if;
    insert into public.loading_company_members values(v_company,p_actor,v_invite.role);
    update public.loading_company_invites set used_at=now() where id=v_invite.id;
    insert into public.loading_company_events(company_id,actor_id,action) values(v_company,p_actor,'member_joined');
    return jsonb_build_object('id',v_space.id,'name',v_space.name,'role',v_invite.role);
  end if;
  select role into v_role from public.loading_company_members where company_id=v_company and member_id=p_actor;
  if v_role is null then raise exception 'company_forbidden'; end if;
  if p_op='detail' then
    v_offset:=coalesce((p_payload->>'planOffset')::integer,0);
    if v_offset<0 or v_offset>100000 then raise exception 'company_invalid'; end if;
    return jsonb_build_object('space',jsonb_build_object('id',v_space.id,'name',v_space.name,'role',v_role),
      'planOffset',v_offset,'hasMorePlans',exists(select 1 from public.loading_company_plans where company_id=v_company offset v_offset+20 limit 1),
      'members',coalesce((select jsonb_agg(jsonb_build_object('member_id',m.member_id,'role',m.role,'display_name',a.display_name) order by a.display_name,m.member_id)
        from public.loading_company_members m join public.loading_members a on a.id=m.member_id where m.company_id=v_company),'[]'::jsonb),
      'plans',coalesce((select jsonb_agg(to_jsonb(p) order by p.updated_at desc,p.id) from
        (select id,title,status,revision,created_by,submitted_by,updated_at from public.loading_company_plans where company_id=v_company order by updated_at desc,id offset v_offset limit 20) p),'[]'::jsonb),
      'events',coalesce((select jsonb_agg(e.item order by e.created_at desc,e.id) from (
        select ev.id,ev.created_at,to_jsonb(ev)-'actor_id'||jsonb_build_object('actor_name',a.display_name) item
        from public.loading_company_events ev join public.loading_members a on a.id=ev.actor_id where ev.company_id=v_company order by ev.created_at desc,ev.id limit 100) e),'[]'::jsonb));
  elsif p_op='plan' then
    select * into v_plan from public.loading_company_plans where company_id=v_company and id=(p_payload->>'planId')::uuid;
    if not found then raise exception 'company_forbidden'; end if;
    return to_jsonb(v_plan);
  elsif p_op='invite' then
    if v_role not in ('owner','admin') then raise exception 'company_forbidden'; end if;
    if coalesce(p_payload->>'role','') not in ('planner','approver','viewer') or
      coalesce(p_payload->>'email','') !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then raise exception 'company_invalid'; end if;
    insert into public.loading_company_invites(company_id,token_hash,email,role,created_by)
      values(v_company,p_payload->>'inviteHash',lower(btrim(p_payload->>'email')),p_payload->>'role',p_actor) returning * into v_invite;
    insert into public.loading_company_events(company_id,actor_id,action,comment) values(v_company,p_actor,'invite_created',v_invite.email||' · '||v_invite.role);
    return jsonb_build_object('expiresAt',v_invite.expires_at);
  elsif p_op='role' then
    if v_role not in ('owner','admin') then raise exception 'company_forbidden'; end if;
    select role into v_target_role from public.loading_company_members where company_id=v_company and member_id=(p_payload->>'memberId')::uuid;
    if v_target_role is null or v_target_role='owner' or (v_role='admin' and (v_target_role='admin' or p_payload->>'role'='admin')) then raise exception 'company_forbidden'; end if;
    if coalesce(p_payload->>'role','') not in ('admin','planner','approver','viewer','removed') then raise exception 'company_invalid'; end if;
    if p_payload->>'role'='removed' then
      delete from public.loading_company_members where company_id=v_company and member_id=(p_payload->>'memberId')::uuid;
    else
      update public.loading_company_members set role=p_payload->>'role' where company_id=v_company and member_id=(p_payload->>'memberId')::uuid;
    end if;
    -- All previously issued invitations expire on any issuer role change/removal.
    update public.loading_company_invites set expires_at=least(expires_at,now()) where company_id=v_company and created_by=(p_payload->>'memberId')::uuid and used_at is null;
    insert into public.loading_company_events(company_id,actor_id,action,comment) values(v_company,p_actor,'role_changed',(p_payload->>'memberId')||' · '||(p_payload->>'role'));
    return '{}'::jsonb;
  end if;
  if p_op not in ('save','submit','review') then raise exception 'company_invalid'; end if;
  if p_op in ('save','submit') and v_role not in ('owner','admin','planner') then raise exception 'company_forbidden'; end if;
  if p_op='review' and v_role not in ('owner','admin','approver') then raise exception 'company_forbidden'; end if;
  if p_payload->>'planId' is not null then
    select * into v_plan from public.loading_company_plans where id=(p_payload->>'planId')::uuid and company_id=v_company for update;
    if not found then raise exception 'company_forbidden'; end if;
    if (p_payload->>'expectedRevision')::integer is distinct from v_plan.revision then raise exception 'company_conflict'; end if;
  elsif p_op<>'save' then raise exception 'company_invalid';
  end if;
  if p_op='save' then
    v_title:=btrim(p_payload->>'title');
    if v_title is null or char_length(v_title) not between 1 and 120 or jsonb_typeof(p_payload->'snapshot') is distinct from 'object' then raise exception 'company_invalid'; end if;
    if v_plan.id is null then
      insert into public.loading_company_plans(company_id,title,snapshot,created_by) values(v_company,v_title,p_payload->'snapshot',p_actor) returning * into v_plan;
    else
      update public.loading_company_plans set title=v_title,snapshot=p_payload->'snapshot',status='draft',submitted_by=null,revision=revision+1,updated_at=clock_timestamp() where id=v_plan.id returning * into v_plan;
    end if;
    v_action:='plan_saved';
  elsif p_op='submit' then
    if v_plan.status not in ('draft','changes_requested') then raise exception 'company_conflict'; end if;
    -- Recorded browser evidence is not server certification. Operator review is
    -- separate from simulator dispatch validation. WHAT-IF can never be approved.
    if not public.loading_company_reviewable(v_plan.snapshot) then raise exception 'company_review_required'; end if;
    update public.loading_company_plans set status='submitted',submitted_by=p_actor,revision=revision+1,updated_at=clock_timestamp() where id=v_plan.id returning * into v_plan;
    v_action:='plan_submitted';
  else
    if v_plan.status<>'submitted' then raise exception 'company_conflict'; end if;
    if v_plan.submitted_by=p_actor then raise exception 'company_self_review'; end if;
    if coalesce(p_payload->>'decision','') not in ('approved','changes_requested') or
      (p_payload->>'decision'='changes_requested' and char_length(btrim(coalesce(p_payload->>'comment','')))=0) then raise exception 'company_invalid'; end if;
    update public.loading_company_plans set status=p_payload->>'decision',revision=revision+1,updated_at=clock_timestamp() where id=v_plan.id returning * into v_plan;
    v_action:=case when v_plan.status='approved' then 'plan_approved' else 'plan_changes_requested' end;
  end if;
  insert into public.loading_company_versions(plan_id,revision,snapshot,title,created_by) values(v_plan.id,v_plan.revision,v_plan.snapshot,v_plan.title,p_actor);
  insert into public.loading_company_events(company_id,plan_id,actor_id,action,revision,comment) values(v_company,v_plan.id,p_actor,v_action,v_plan.revision,p_payload->>'comment');
  return to_jsonb(v_plan);
end;
$$;
revoke all on function public.loading_company_action(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.loading_company_action(uuid,text,jsonb) to service_role;
