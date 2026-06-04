-- Idempotency for create-site-package Edge (service_role writes; no client policies).

create table if not exists public.site_package_publish_idempotency (
  site_id uuid not null references public.sites (id) on delete cascade,
  idempotency_key text not null,
  package_version int not null,
  storage_path text not null,
  response_json jsonb not null,
  created_at timestamptz not null default now(),
  primary key (site_id, idempotency_key)
);

comment on table public.site_package_publish_idempotency is
  'Stores last successful Edge publish response per (site, idempotency_key) for safe retries.';

alter table public.site_package_publish_idempotency enable row level security;

revoke all on table public.site_package_publish_idempotency from public;
revoke all on table public.site_package_publish_idempotency from anon, authenticated;
