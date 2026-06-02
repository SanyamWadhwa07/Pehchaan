-- Pehchaan — Storage bucket + RLS for encrypted site packages
-- Bucket id: site-packages (private). Object key convention: {site_id}/{filename}
--   e.g. a1bd38ee-b9c7-482b-ba8f-ac8e4dec429a/v12.zip
-- Aligns with public.site_packages.storage_path storing this object path or full key.

-- Idempotent: safe if bucket already created in Dashboard (private)
insert into storage.buckets (id, name, public)
values ('site-packages', 'site-packages', false)
on conflict (id) do update
set public = false;

-- ─── storage.objects policies (private bucket) ─────────────────────────────

-- Supervisors: read objects under their site folder only
drop policy if exists "site_packages_select_supervisor" on storage.objects;
create policy "site_packages_select_supervisor"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'site-packages'
    and exists (
      select 1
      from public.sites s
      where s.supervisor_id = auth.uid()
        and s.id::text = split_part(name, '/', 1)
    )
  );

-- Devices: read objects for JWT site_id (Option A app_metadata)
drop policy if exists "site_packages_select_device" on storage.objects;
create policy "site_packages_select_device"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'site-packages'
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'pehchaan_role', '') = 'device'
    and (auth.jwt() -> 'app_metadata' ->> 'site_id') is not null
    and (auth.jwt() -> 'app_metadata' ->> 'site_id') = split_part(name, '/', 1)
  );

-- Admin JWT: full read within bucket
drop policy if exists "site_packages_select_admin" on storage.objects;
create policy "site_packages_select_admin"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'site-packages'
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'pehchaan_role', '') = 'admin'
  );

-- Uploads: supervisor may put files only under their site prefix (edge functions often use service_role instead)
drop policy if exists "site_packages_insert_supervisor_site" on storage.objects;
create policy "site_packages_insert_supervisor_site"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'site-packages'
    and exists (
      select 1
      from public.sites s
      where s.supervisor_id = auth.uid()
        and s.id::text = split_part(name, '/', 1)
    )
  );

drop policy if exists "site_packages_insert_admin" on storage.objects;
create policy "site_packages_insert_admin"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'site-packages'
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'pehchaan_role', '') = 'admin'
  );

-- Updates/deletes: admin or owning supervisor (same site prefix)
drop policy if exists "site_packages_update_scope" on storage.objects;
create policy "site_packages_update_scope"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'site-packages'
    and (
      coalesce(auth.jwt() -> 'app_metadata' ->> 'pehchaan_role', '') = 'admin'
      or exists (
        select 1
        from public.sites s
        where s.supervisor_id = auth.uid()
          and s.id::text = split_part(name, '/', 1)
      )
    )
  )
  with check (
    bucket_id = 'site-packages'
    and (
      coalesce(auth.jwt() -> 'app_metadata' ->> 'pehchaan_role', '') = 'admin'
      or exists (
        select 1
        from public.sites s
        where s.supervisor_id = auth.uid()
          and s.id::text = split_part(name, '/', 1)
      )
    )
  );

drop policy if exists "site_packages_delete_scope" on storage.objects;
create policy "site_packages_delete_scope"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'site-packages'
    and (
      coalesce(auth.jwt() -> 'app_metadata' ->> 'pehchaan_role', '') = 'admin'
      or exists (
        select 1
        from public.sites s
        where s.supervisor_id = auth.uid()
          and s.id::text = split_part(name, '/', 1)
      )
    )
  );
