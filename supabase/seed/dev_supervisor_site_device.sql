-- Dev seed: link supervisor Auth user → site, optional worker + device for RLS tests.
-- Run in Supabase SQL Editor (uses privileges that can read auth.users).
-- Adjust emails / names as needed.

-- 1) Site owned by supervisor@test.com (skip if you already have a site for this user)
insert into public.sites (name, project_code, supervisor_id, package_version)
select
  'Demo NHAI Site',
  'DEMO-001',
  u.id,
  0
from auth.users u
where u.email = 'supervisor@test.com'
  and not exists (
    select 1 from public.sites s where s.supervisor_id = u.id
  )
limit 1;

-- 2) Optional: one worker at that site (supervisor as created_by) — embedding left null for dev
insert into public.workers (name, role, site_id, language_preference, created_by)
select
  'Test Worker',
  'Mason',
  s.id,
  'en',
  s.supervisor_id
from public.sites s
join auth.users u on u.id = s.supervisor_id
where u.email = 'supervisor@test.com'
  and not exists (
    select 1 from public.workers w where w.site_id = s.id and w.name = 'Test Worker'
  )
limit 1;

-- 3) Device row for attendance insert tests (supervisor must exist for site)
insert into public.devices (supervisor_id, site_id, platform, app_version)
select
  s.supervisor_id,
  s.id,
  'android',
  '0.0.1'
from public.sites s
join auth.users u on u.id = s.supervisor_id
where u.email = 'supervisor@test.com'
  and not exists (
    select 1 from public.devices d where d.site_id = s.id and d.platform = 'android'
  )
limit 1;

-- 4) DEVICE Auth user (create in Dashboard first: Authentication → Add user → device@test.com + password)
--    Then set Raw app meta data EXACTLY (replace SITE_UUID with id from: select id from sites limit 1;):
--
--    { "pehchaan_role": "device", "site_id": "SITE_UUID" }
--
--    Option B (later): Custom Access Token Hook merges these from a trusted table instead of user-editable metadata.
