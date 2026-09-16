create table if not exists public.loading_member_data (
  member_id uuid primary key references public.loading_members(id) on delete cascade,
  planner_state jsonb,
  personal_boxes jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.loading_member_data enable row level security;

comment on table public.loading_member_data is
  'Server-only account-scoped cargo planner and personal box data for cross-device sync in the container loading simulator.';
comment on column public.loading_member_data.planner_state is
  'Serialized enterprise packaging planner state including the company product catalog.';
comment on column public.loading_member_data.personal_boxes is
  'Serialized personal box catalog explicitly owned by the loading member.';
