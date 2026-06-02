import { appSchema, tableSchema } from '@nozbe/watermelondb';

/**
 * Local SQLite schema (WatermelonDB).
 * Mirrors Supabase row shapes where applicable — see @/lib/db/rows and @/types.
 */
export const SCHEMA_VERSION = 2;

export const schema = appSchema({
  version: SCHEMA_VERSION,
  tables: [
    tableSchema({
      name: 'workers',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'role', type: 'string' },
        { name: 'site_id', type: 'string', isIndexed: true },
        { name: 'language_preference', type: 'string' },
        { name: 'enrolled_at', type: 'number' },
        { name: 'revoked_at', type: 'string', isOptional: true },
        { name: 'reference_thumbnail_url', type: 'string', isOptional: true },
        { name: 'is_revoked', type: 'boolean' },
        { name: 'embedding_encrypted_base64', type: 'string', isOptional: true },
      ],
    }),
    tableSchema({
      name: 'attendance_records',
      columns: [
        { name: 'worker_id', type: 'string', isIndexed: true },
        { name: 'site_id', type: 'string', isIndexed: true },
        { name: 'device_id', type: 'string' },
        { name: 'supervisor_id', type: 'string', isOptional: true },
        { name: 'supervisor_confirmed', type: 'boolean' },
        { name: 'auth_timestamp', type: 'number' },
        { name: 'confidence_score', type: 'number', isOptional: true },
        { name: 'auth_tier', type: 'string', isOptional: true },
        { name: 'liveness_score', type: 'number', isOptional: true },
        { name: 'liveness_passed', type: 'boolean' },
        { name: 'challenge_type', type: 'string', isOptional: true },
        { name: 'challenge_result', type: 'boolean', isOptional: true },
        { name: 'outbox_sync_status', type: 'string', isIndexed: true },
        { name: 'server_record_id', type: 'string', isOptional: true },
        { name: 'synced_at', type: 'number', isOptional: true },
        { name: 'purged_at', type: 'number', isOptional: true },
        { name: 'fail_reason', type: 'string', isOptional: true },
        { name: 'integration_push_status', type: 'string' },
      ],
    }),
    tableSchema({
      name: 'registration_requests',
      columns: [
        { name: 'worker_name', type: 'string' },
        { name: 'role', type: 'string' },
        { name: 'aadhaar_ref_hash', type: 'string', isOptional: true },
        { name: 'site_id', type: 'string', isIndexed: true },
        { name: 'status', type: 'string', isIndexed: true },
        { name: 'review_note', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'approved_at', type: 'number', isOptional: true },
        { name: 'contact_number', type: 'string', isOptional: true },
        { name: 'captured_angles_json', type: 'string' },
        { name: 'submitted_by_supervisor_id', type: 'string', isOptional: true },
      ],
    }),
  ],
});
