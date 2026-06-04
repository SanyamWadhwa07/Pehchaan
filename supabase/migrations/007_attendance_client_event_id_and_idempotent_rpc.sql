-- Attendance idempotency: stable client_event_id per tap + batch RPC for safe retries.
-- Unique index on client_event_id: multiple NULLs allowed (Postgres NULL != NULL).

alter table public.attendance_records
  add column if not exists client_event_id uuid;

comment on column public.attendance_records.client_event_id is
  'UUID generated once on device per attendance tap; duplicate RPC/insert returns same row via insert_attendance_batch_idempotent.';

drop index if exists attendance_records_client_event_id_key;

create unique index if not exists attendance_records_client_event_id_key
  on public.attendance_records (client_event_id);

-- Batch idempotent insert: ON CONFLICT returns existing row (no 500 on retry / double-tap replay).
create or replace function public.insert_attendance_batch_idempotent(p_rows jsonb)
returns setof public.attendance_records
language plpgsql
security invoker
set search_path = public
as $$
declare
  el jsonb;
  rec public.attendance_records%rowtype;
  v_client uuid;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;

  for el in select value from jsonb_array_elements(p_rows) as t(value)
  loop
    v_client := nullif(trim(el->> 'client_event_id'), '')::uuid;

    if v_client is null then
      insert into public.attendance_records (
        worker_id,
        site_id,
        device_id,
        auth_timestamp,
        confidence_score,
        auth_tier,
        liveness_score,
        liveness_passed,
        challenge_type,
        challenge_result,
        supervisor_id,
        supervisor_confirmed,
        sync_status,
        server_record_id,
        synced_at,
        purged_at,
        fail_reason,
        integration_push_status,
        client_event_id
      )
      values (
        (el->> 'worker_id')::uuid,
        (el->> 'site_id')::uuid,
        (el->> 'device_id')::uuid,
        (el->> 'auth_timestamp')::timestamptz,
        nullif(el->> 'confidence_score', '')::numeric,
        nullif(el->> 'auth_tier', '')::public.auth_tier_enum,
        nullif(el->> 'liveness_score', '')::numeric,
        coalesce((el->> 'liveness_passed')::boolean, false),
        nullif(el->> 'challenge_type', ''),
        nullif(el->> 'challenge_result', '')::boolean,
        nullif(el->> 'supervisor_id', '')::uuid,
        coalesce((el->> 'supervisor_confirmed')::boolean, false),
        coalesce(nullif(el->> 'sync_status', '')::public.sync_status_enum, 'pending'::public.sync_status_enum),
        nullif(el->> 'server_record_id', '')::uuid,
        nullif(el->> 'synced_at', '')::timestamptz,
        nullif(el->> 'purged_at', '')::timestamptz,
        nullif(el->> 'fail_reason', ''),
        coalesce(
          nullif(el->> 'integration_push_status', '')::public.integration_push_status_enum,
          'queued'::public.integration_push_status_enum
        ),
        null
      )
      returning * into rec;
      return next rec;
    else
      insert into public.attendance_records (
        worker_id,
        site_id,
        device_id,
        auth_timestamp,
        confidence_score,
        auth_tier,
        liveness_score,
        liveness_passed,
        challenge_type,
        challenge_result,
        supervisor_id,
        supervisor_confirmed,
        sync_status,
        server_record_id,
        synced_at,
        purged_at,
        fail_reason,
        integration_push_status,
        client_event_id
      )
      values (
        (el->> 'worker_id')::uuid,
        (el->> 'site_id')::uuid,
        (el->> 'device_id')::uuid,
        (el->> 'auth_timestamp')::timestamptz,
        nullif(el->> 'confidence_score', '')::numeric,
        nullif(el->> 'auth_tier', '')::public.auth_tier_enum,
        nullif(el->> 'liveness_score', '')::numeric,
        coalesce((el->> 'liveness_passed')::boolean, false),
        nullif(el->> 'challenge_type', ''),
        nullif(el->> 'challenge_result', '')::boolean,
        nullif(el->> 'supervisor_id', '')::uuid,
        coalesce((el->> 'supervisor_confirmed')::boolean, false),
        coalesce(nullif(el->> 'sync_status', '')::public.sync_status_enum, 'pending'::public.sync_status_enum),
        nullif(el->> 'server_record_id', '')::uuid,
        nullif(el->> 'synced_at', '')::timestamptz,
        nullif(el->> 'purged_at', '')::timestamptz,
        nullif(el->> 'fail_reason', ''),
        coalesce(
          nullif(el->> 'integration_push_status', '')::public.integration_push_status_enum,
          'queued'::public.integration_push_status_enum
        ),
        v_client
      )
      on conflict (client_event_id) do update
        set auth_timestamp = public.attendance_records.auth_timestamp
      returning * into rec;
      return next rec;
    end if;
  end loop;
  return;
end;
$$;

grant execute on function public.insert_attendance_batch_idempotent(jsonb) to authenticated;

comment on function public.insert_attendance_batch_idempotent(jsonb) is
  'Device batch insert with idempotency on client_event_id; RLS applies (security invoker).';
