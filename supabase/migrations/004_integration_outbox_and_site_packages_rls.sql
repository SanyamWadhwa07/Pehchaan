-- Pehchaan — Integration queue + supervisor site_packages insert
-- 1) Outbox rows for future DataLink / edge workers (service_role bypasses RLS).
-- 2) Supervisors may insert site_packages for sites they supervise (edge + app).

-- ─── integration_attendance_outbox ─────────────────────────────────────────

create table if not exists public.integration_attendance_outbox (
  id uuid primary key default gen_random_uuid(),
  attendance_id uuid not null references public.attendance_records (id) on delete cascade,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

comment on table public.integration_attendance_outbox is
  'Queued attendance row IDs for integration edge / worker (Day 3+). Filled by trigger on insert.';

alter table public.integration_attendance_outbox enable row level security;

-- No policies: authenticated/anon denied; service_role bypasses RLS for workers.

create or replace function public.queue_attendance_integration()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.integration_attendance_outbox (attendance_id)
  values (new.id);
  return new;
end;
$$;

drop trigger if exists trg_queue_attendance_integration on public.attendance_records;

create trigger trg_queue_attendance_integration
  after insert on public.attendance_records
  for each row
  execute function public.queue_attendance_integration();

revoke all on table public.integration_attendance_outbox from public;
revoke all on table public.integration_attendance_outbox from anon, authenticated;

-- ─── site_packages: supervisor insert (build pipeline) ─────────────────────

drop policy if exists site_packages_insert_supervisor on public.site_packages;

create policy site_packages_insert_supervisor
  on public.site_packages
  for insert
  to authenticated
  with check (public.is_supervisor_for_site (site_id));
