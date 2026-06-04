-- N3: Server ACK = `sync_status = verified` + `synced_at` so the device mirror can move to
-- local `purged` (tombstone) per `computeLocalAttendanceMirrorFromRemote` / purge policy.

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
        'verified'::public.sync_status_enum,
        nullif(el->> 'server_record_id', '')::uuid,
        now(),
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
        'verified'::public.sync_status_enum,
        nullif(el->> 'server_record_id', '')::uuid,
        now(),
        nullif(el->> 'purged_at', '')::timestamptz,
        nullif(el->> 'fail_reason', ''),
        coalesce(
          nullif(el->> 'integration_push_status', '')::public.integration_push_status_enum,
          'queued'::public.integration_push_status_enum
        ),
        v_client
      )
      on conflict (client_event_id) do update
        set
          sync_status = case
            when attendance_records.sync_status in (
              'pending'::public.sync_status_enum,
              'uploading'::public.sync_status_enum
            )
            then 'verified'::public.sync_status_enum
            else attendance_records.sync_status
          end,
          synced_at = case
            when attendance_records.sync_status in (
              'pending'::public.sync_status_enum,
              'uploading'::public.sync_status_enum
            )
            then now()
            else attendance_records.synced_at
          end
      returning * into rec;
      return next rec;
    end if;
  end loop;
  return;
end;
$$;

comment on function public.insert_attendance_batch_idempotent(jsonb) is
  'Device batch insert with idempotency on client_event_id. New rows and replay ACKs set sync_status=verified and synced_at (N3).';
