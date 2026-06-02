-- Pehchaan — Initial Schema (Dev Backend)
-- Owner: Anoushka
--
-- This schema is the Supabase dev-backend implementation of the sync layer.
-- In production the sync layer targets NHAI DataLink 3.0 APIs directly —
-- the schema structure matches what DataLink 3.0 expects so the swap is config-only.
-- All tables require RLS. Policies in `002_rls_policies.sql`.

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ─── SITES ─────────────────────────────────────────────────────────────────

create table sites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  project_code text not null,
  supervisor_id uuid references auth.users(id),
  package_version int not null default 0,
  package_expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table sites enable row level security;

-- ─── WORKERS ───────────────────────────────────────────────────────────────

create table workers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null,
  site_id uuid not null references sites(id),
  reference_thumbnail_url text,
  embedding_encrypted bytea,       -- AES-256-GCM encrypted; never exposed via REST
  enrolled_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_by uuid references auth.users(id),
  language_preference text not null default 'en' check (language_preference in ('en', 'hi'))
);

alter table workers enable row level security;

-- ─── SITE PACKAGES ─────────────────────────────────────────────────────────

create table site_packages (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id),
  version int not null,
  created_at timestamptz not null default now(),
  storage_path text not null    -- signed URL to AES-256-GCM encrypted zip in Supabase Storage
);

alter table site_packages enable row level security;

-- ─── DEVICES (before attendance_records — FK dependency) ─────────────────

create table devices (
  id uuid primary key default gen_random_uuid(),
  supervisor_id uuid references auth.users(id),
  site_id uuid not null references sites(id),
  platform text not null check (platform in ('android', 'ios')),
  app_version text,
  revoked boolean not null default false,
  last_sync_at timestamptz,
  trust_score numeric(3,2) default 1.0
);

alter table devices enable row level security;

-- ─── ATTENDANCE RECORDS ────────────────────────────────────────────────────

create type sync_status_enum as enum ('pending', 'uploading', 'verified', 'purged', 'failed');
create type auth_tier_enum as enum ('high', 'medium', 'low');
create type integration_push_status_enum as enum ('queued', 'pushed', 'failed', 'not_applicable');

create table attendance_records (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references workers(id),
  site_id uuid not null references sites(id),
  device_id uuid not null references devices(id),
  auth_timestamp timestamptz not null,
  confidence_score numeric(5,4),
  auth_tier auth_tier_enum,
  liveness_score numeric(5,4),
  liveness_passed boolean not null default false,
  challenge_type text,
  challenge_result boolean,
  supervisor_id uuid references auth.users(id),
  supervisor_confirmed boolean not null default false,
  sync_status sync_status_enum not null default 'pending',
  server_record_id uuid,
  synced_at timestamptz,
  purged_at timestamptz,
  fail_reason text,
  integration_push_status integration_push_status_enum not null default 'queued'
);

alter table attendance_records enable row level security;

-- ─── REVOCATION LOG ────────────────────────────────────────────────────────

create table revocation_log (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references workers(id),
  site_id uuid not null references sites(id),
  revoked_by uuid references auth.users(id),
  revoked_at timestamptz not null default now(),
  reason text
);

alter table revocation_log enable row level security;

-- ─── REGISTRATION REQUESTS ─────────────────────────────────────────────────

create type registration_status_enum as enum ('pending', 'approved', 'rejected', 'pending_registration');

create table registration_requests (
  id uuid primary key default gen_random_uuid(),
  worker_name text not null,
  role text not null,
  aadhaar_ref_hash text,           -- SHA-256 hash of Aadhaar number; raw number never stored
  site_id uuid not null references sites(id),
  submitted_by uuid references auth.users(id),
  status registration_status_enum not null default 'pending',
  review_note text,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

alter table registration_requests enable row level security;

-- RLS policies: see migration 002_rls_policies.sql
