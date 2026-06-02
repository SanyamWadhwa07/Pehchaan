-- Pehchaan — Row Level Security + helpers
-- Depends on: 001_initial_schema.sql
--
-- JWT convention (set via Supabase Dashboard → Authentication → Users → user metadata,
-- or a Custom Access Token Hook / Edge Function that merges into app_metadata):
--   app_metadata.pehchaan_role  → 'supervisor' | 'device' | 'admin'
--   app_metadata.site_id        → UUID string (required for device; optional extra for supervisor)
--
-- Supervisors linked to a site via public.sites.supervisor_id = auth.uid() always get
-- row access for that site (no JWT claim required).
--
-- service_role bypasses RLS (edge functions, SQL editor, migrations).

-- ─── Helpers (JWT + site membership) ───────────────────────────────────────

create or replace function public.current_site_id_from_jwt()
returns uuid
language sql
stable
security invoker
set search_path = public
as $$
  select nullif(trim(auth.jwt() -> 'app_metadata' ->> 'site_id'), '')::uuid;
$$;

create or replace function public.current_pehchaan_role()
returns text
language sql
stable
security invoker
set search_path = public
as $$
  select lower(trim(coalesce(auth.jwt() -> 'app_metadata' ->> 'pehchaan_role', '')));
$$;

create or replace function public.is_supervisor_for_site(p_site_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.sites s
    where s.id = p_site_id
      and s.supervisor_id = auth.uid()
  );
$$;

create or replace function public.is_device_for_site(p_site_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select public.current_pehchaan_role() = 'device'
    and public.current_site_id_from_jwt() is not null
    and public.current_site_id_from_jwt() = p_site_id;
$$;

create or replace function public.is_admin_jwt()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select public.current_pehchaan_role() = 'admin';
$$;

grant execute on function public.current_site_id_from_jwt() to authenticated;
grant execute on function public.current_pehchaan_role() to authenticated;
grant execute on function public.is_supervisor_for_site(uuid) to authenticated;
grant execute on function public.is_device_for_site(uuid) to authenticated;
grant execute on function public.is_admin_jwt() to authenticated;

-- ─── Embedding column: never readable via PostgREST for anon/authenticated ───
-- Edge functions using service_role still see all columns (RLS bypass + ownership).

revoke select (embedding_encrypted) on public.workers from anon, authenticated;

-- ─── sites ─────────────────────────────────────────────────────────────────

create policy sites_select_scope
  on public.sites
  for select
  to authenticated
  using (
    public.is_admin_jwt()
    or supervisor_id = auth.uid()
    or public.is_device_for_site(id)
  );

create policy sites_update_admin
  on public.sites
  for update
  to authenticated
  using (public.is_admin_jwt())
  with check (public.is_admin_jwt());

create policy sites_update_supervisor_own
  on public.sites
  for update
  to authenticated
  using (supervisor_id = auth.uid())
  with check (supervisor_id = auth.uid());

create policy sites_insert_admin
  on public.sites
  for insert
  to authenticated
  with check (public.is_admin_jwt());

-- Dev bootstrap: authenticated user may create a site they supervise (no admin metadata required).
create policy sites_insert_self_supervisor
  on public.sites
  for insert
  to authenticated
  with check (
    supervisor_id is not null
    and supervisor_id = auth.uid()
  );

-- ─── workers ───────────────────────────────────────────────────────────────

create policy workers_select_scope
  on public.workers
  for select
  to authenticated
  using (
    public.is_admin_jwt()
    or public.is_supervisor_for_site(site_id)
    or public.is_device_for_site(site_id)
  );

create policy workers_insert_supervisor
  on public.workers
  for insert
  to authenticated
  with check (
    public.is_admin_jwt()
    or (
      public.is_supervisor_for_site(site_id)
      and created_by = auth.uid()
    )
  );

create policy workers_update_supervisor
  on public.workers
  for update
  to authenticated
  using (public.is_admin_jwt() or public.is_supervisor_for_site(site_id))
  with check (public.is_admin_jwt() or public.is_supervisor_for_site(site_id));

-- ─── site_packages ─────────────────────────────────────────────────────────

create policy site_packages_select_scope
  on public.site_packages
  for select
  to authenticated
  using (
    public.is_admin_jwt()
    or public.is_supervisor_for_site(site_id)
    or public.is_device_for_site(site_id)
  );

create policy site_packages_write_admin
  on public.site_packages
  for insert
  to authenticated
  with check (public.is_admin_jwt());

create policy site_packages_update_admin
  on public.site_packages
  for update
  to authenticated
  using (public.is_admin_jwt())
  with check (public.is_admin_jwt());

-- ─── devices ───────────────────────────────────────────────────────────────

create policy devices_select_scope
  on public.devices
  for select
  to authenticated
  using (
    public.is_admin_jwt()
    or public.is_supervisor_for_site(site_id)
    or public.is_device_for_site(site_id)
  );

create policy devices_insert_supervisor
  on public.devices
  for insert
  to authenticated
  with check (
    public.is_admin_jwt()
    or (
      public.is_supervisor_for_site(site_id)
      and supervisor_id = auth.uid()
    )
  );

create policy devices_update_supervisor
  on public.devices
  for update
  to authenticated
  using (public.is_admin_jwt() or public.is_supervisor_for_site(site_id))
  with check (public.is_admin_jwt() or public.is_supervisor_for_site(site_id));

-- ─── attendance_records ─────────────────────────────────────────────────────

create policy attendance_select_scope
  on public.attendance_records
  for select
  to authenticated
  using (
    public.is_admin_jwt()
    or public.is_supervisor_for_site(site_id)
    or public.is_device_for_site(site_id)
  );

create policy attendance_insert_device
  on public.attendance_records
  for insert
  to authenticated
  with check (
    public.is_admin_jwt()
    or (
      public.is_device_for_site(site_id)
      and exists (
        select 1
        from public.devices d
        where d.id = device_id
          and d.site_id = site_id
      )
    )
  );

create policy attendance_update_scope
  on public.attendance_records
  for update
  to authenticated
  using (
    public.is_admin_jwt()
    or public.is_supervisor_for_site(site_id)
    or public.is_device_for_site(site_id)
  )
  with check (
    public.is_admin_jwt()
    or public.is_supervisor_for_site(site_id)
    or public.is_device_for_site(site_id)
  );

-- integration_push_status should only change server-side; enforce in Edge Function + trigger later if needed.

-- ─── revocation_log ──────────────────────────────────────────────────────────

create policy revocation_select_scope
  on public.revocation_log
  for select
  to authenticated
  using (
    public.is_admin_jwt()
    or public.is_supervisor_for_site(site_id)
    or public.is_device_for_site(site_id)
  );

create policy revocation_insert_admin
  on public.revocation_log
  for insert
  to authenticated
  with check (public.is_admin_jwt());

-- ─── registration_requests ───────────────────────────────────────────────────

create policy registration_select_scope
  on public.registration_requests
  for select
  to authenticated
  using (
    public.is_admin_jwt()
    or public.is_supervisor_for_site(site_id)
    or submitted_by = auth.uid()
  );

create policy registration_insert_supervisor_or_device
  on public.registration_requests
  for insert
  to authenticated
  with check (
    public.is_admin_jwt()
    or (
      (public.is_supervisor_for_site(site_id) or public.is_device_for_site(site_id))
      and submitted_by = auth.uid()
    )
  );

create policy registration_update_supervisor_admin
  on public.registration_requests
  for update
  to authenticated
  using (public.is_admin_jwt() or public.is_supervisor_for_site(site_id))
  with check (public.is_admin_jwt() or public.is_supervisor_for_site(site_id));
