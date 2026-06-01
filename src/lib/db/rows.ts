/**
 * Postgres / Supabase row shapes (snake_case).
 *
 * Use only inside sync and API layers. Screens and hooks should use @/types.
 */

import type {
  AuthTier,
  IntegrationPushStatus,
  LivenessChallenge,
  SyncStatus,
} from '@/types';

export interface WorkerRow {
  id: string;
  name: string;
  role: string;
  site_id: string;
  reference_thumbnail_url: string | null;
  enrolled_at: string;
  revoked_at: string | null;
  language_preference: 'en' | 'hi';
}

export interface AttendanceRecordRow {
  id: string;
  worker_id: string;
  site_id: string;
  device_id: string;
  auth_timestamp: string;
  confidence_score: number | null;
  auth_tier: AuthTier | null;
  liveness_score: number | null;
  liveness_passed: boolean;
  challenge_type: string | null;
  challenge_result: boolean | null;
  supervisor_id: string | null;
  supervisor_confirmed: boolean;
  sync_status: SyncStatus;
  server_record_id: string | null;
  synced_at: string | null;
  purged_at: string | null;
  fail_reason: string | null;
  integration_push_status: IntegrationPushStatus;
}

export interface RegistrationRequestRow {
  id: string;
  worker_name: string;
  role: string;
  aadhaar_ref_hash: string | null;
  site_id: string;
  status: 'pending' | 'pending_registration' | 'approved' | 'rejected';
  review_note: string | null;
  created_at: string;
  approved_at: string | null;
}

export interface DeviceRow {
  id: string;
  supervisor_id: string | null;
  site_id: string;
  platform: 'android' | 'ios';
  app_version: string | null;
  revoked: boolean;
  last_sync_at: string | null;
  trust_score: number | null;
}
