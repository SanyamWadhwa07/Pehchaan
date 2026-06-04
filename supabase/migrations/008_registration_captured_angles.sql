-- N2: Persist field-registration face captures on `registration_requests` + private storage for large blobs.

alter table public.registration_requests
  add column if not exists captured_angles_json jsonb;

comment on column public.registration_requests.captured_angles_json is
  'Per-angle captures from the field outbox: inline base64 strings and/or {ref:storage,bucket,path} after upload when payload is large.';

-- Private bucket — object key: {site_id}/registration-captures/{local_row_id}/{angle}.bin
insert into storage.buckets (id, name, public)
values ('registration-captures', 'registration-captures', false)
on conflict (id) do update
set public = false;

drop policy if exists "registration_captures_select_supervisor" on storage.objects;
create policy "registration_captures_select_supervisor"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'registration-captures'
    and exists (
      select 1
      from public.sites s
      where s.supervisor_id = auth.uid()
        and s.id::text = split_part(name, '/', 1)
    )
  );

drop policy if exists "registration_captures_select_device" on storage.objects;
create policy "registration_captures_select_device"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'registration-captures'
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'pehchaan_role', '') = 'device'
    and (auth.jwt() -> 'app_metadata' ->> 'site_id') is not null
    and (auth.jwt() -> 'app_metadata' ->> 'site_id') = split_part(name, '/', 1)
  );

drop policy if exists "registration_captures_select_admin" on storage.objects;
create policy "registration_captures_select_admin"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'registration-captures'
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'pehchaan_role', '') = 'admin'
  );

drop policy if exists "registration_captures_insert_supervisor_site" on storage.objects;
create policy "registration_captures_insert_supervisor_site"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'registration-captures'
    and exists (
      select 1
      from public.sites s
      where s.supervisor_id = auth.uid()
        and s.id::text = split_part(name, '/', 1)
    )
  );

drop policy if exists "registration_captures_insert_device_site" on storage.objects;
create policy "registration_captures_insert_device_site"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'registration-captures'
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'pehchaan_role', '') = 'device'
    and (auth.jwt() -> 'app_metadata' ->> 'site_id') is not null
    and (auth.jwt() -> 'app_metadata' ->> 'site_id') = split_part(name, '/', 1)
  );

drop policy if exists "registration_captures_insert_admin" on storage.objects;
create policy "registration_captures_insert_admin"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'registration-captures'
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'pehchaan_role', '') = 'admin'
  );

drop policy if exists "registration_captures_update_scope" on storage.objects;
create policy "registration_captures_update_scope"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'registration-captures'
    and (
      coalesce(auth.jwt() -> 'app_metadata' ->> 'pehchaan_role', '') = 'admin'
      or exists (
        select 1
        from public.sites s
        where s.supervisor_id = auth.uid()
          and s.id::text = split_part(name, '/', 1)
      )
      or (
        coalesce(auth.jwt() -> 'app_metadata' ->> 'pehchaan_role', '') = 'device'
        and (auth.jwt() -> 'app_metadata' ->> 'site_id') = split_part(name, '/', 1)
      )
    )
  )
  with check (
    bucket_id = 'registration-captures'
    and (
      coalesce(auth.jwt() -> 'app_metadata' ->> 'pehchaan_role', '') = 'admin'
      or exists (
        select 1
        from public.sites s
        where s.supervisor_id = auth.uid()
          and s.id::text = split_part(name, '/', 1)
      )
      or (
        coalesce(auth.jwt() -> 'app_metadata' ->> 'pehchaan_role', '') = 'device'
        and (auth.jwt() -> 'app_metadata' ->> 'site_id') = split_part(name, '/', 1)
      )
    )
  );

drop policy if exists "registration_captures_delete_scope" on storage.objects;
create policy "registration_captures_delete_scope"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'registration-captures'
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
