-- Per-device site-package key envelope (Day 2 — optional provisioning)
-- Each device may register a 32-byte symmetric device key during provisioning.
-- The Edge create-site-package function wraps the per-package data key with this
-- device key when building a per_device_v1 envelope.

alter table public.devices
  add column if not exists device_key_b64 text;

comment on column public.devices.device_key_b64 is
  'Base64 of 32 raw bytes. Set during device provisioning. '
  'Used to wrap per-package data keys for per_device_v1 key envelopes. '
  'Never expose over anon channel — supervisor/admin writes only.';
