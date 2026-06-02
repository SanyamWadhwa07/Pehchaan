-- Patch device@test.com for RLS (Option A): merge into raw_app_meta_data.
-- site_id MUST be public.sites.id (not the Auth user id).
-- Run in SQL Editor or: npx supabase db query --linked -f supabase/seed/patch_device_app_metadata.sql

update auth.users u
set raw_app_meta_data =
  coalesce(u.raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object(
    'pehchaan_role',
    'device',
    'site_id',
    (
      select s.id::text
      from public.sites s
      join auth.users su on su.id = s.supervisor_id
      where su.email = 'supervisor@test.com'
      limit 1
    )
  )
where u.email = 'device@test.com'
  and exists (
    select 1
    from public.sites s2
    join auth.users su2 on su2.id = s2.supervisor_id
    where su2.email = 'supervisor@test.com'
  );

-- If 0 rows updated: fix supervisor email in this file or create site first.
