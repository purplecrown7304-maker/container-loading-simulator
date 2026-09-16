alter table public.loading_member_data
  add column if not exists app_state jsonb not null default '{}'::jsonb,
  add column if not exists schema_version integer not null default 1;

comment on column public.loading_member_data.app_state is
  'Account-scoped persistent application state for the container loading simulator. Browser localStorage is not the source of truth.';

comment on column public.loading_member_data.schema_version is
  'Schema version for app_state migrations.';
