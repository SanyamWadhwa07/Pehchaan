/**
 * Pehchaan — Shared Type Contracts
 *
 * App-facing shapes only (camelCase). Postgres rows live in @/lib/db/rows.
 * Conversions: @/lib/db/mappers. Conventions: docs/CODE_CONVENTIONS.md
 *
 * DO NOT add implementation here. Types only.
 */

// ---------------------------------------------------------------------------
// Primitives / enums
// ---------------------------------------------------------------------------

/** ISO-8601 string, e.g. "2026-06-01T08:30:00.000Z" */
export type ISOTimestamp = string;

/** UUID v4 */
export type UUID = string;

/** Cosine similarity score in [0, 1]. 1 = identical embedding. */
export type ConfidenceScore = number;

/**
 * Sync state machine for attendance records.
 * Transitions: Pending → Uploading → Verified → Purged
 *              any state → Failed (exponential backoff retry)
 * Purge only after server ACK.
 */
export type SyncStatus = 'pending' | 'uploading' | 'verified' | 'purged' | 'failed';

/**
 * Auth confidence tier — drives number of liveness challenges.
 *   high:    confidence > 0.92  → 1 challenge
 *   medium:  confidence 0.80–0.92 → 2 challenges
 *   low:     confidence < 0.80  → 3 challenges + supervisor flag
 */
export type AuthTier = 'high' | 'medium' | 'low';

/** Liveness challenge type presented to worker. */
export type LivenessChallenge = 'blink' | 'turn_left' | 'turn_right';

/** Supervisor action on the confirmation screen. */
export type SupervisorAction = 'confirmed' | 'rejected';

/** DataLink 3.0 push status — set by server-side edge function only. */
export type IntegrationPushStatus = 'queued' | 'pushed' | 'failed' | 'not_applicable';

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

/** Worker profile as stored in the site package and local DB. */
export interface Worker {
  id: UUID;
  name: string;
  /** NHAI contractor / trade role, e.g. "Mason", "Electrician" */
  role: string;
  /** SHA-256 hash of Aadhaar — set after central registration; omitted in site package */
  aadhaarHash?: string;
  siteId: UUID;
  /** Reference thumbnail shown to supervisor on confirmation screen */
  thumbnailBase64?: string;
  enrolledAt: ISOTimestamp;
  /** True if worker has been revoked — blocks authentication */
  isRevoked: boolean;
}

// ---------------------------------------------------------------------------
// ML / Face Recognition  (Sanyam → native bridge)
// ---------------------------------------------------------------------------

/** Raw output from BlazeFace detector (before crop / quality check). */
export interface FaceDetection {
  /** Bounding box in [0,1] normalised coordinates */
  box: { x: number; y: number; width: number; height: number };
  /** Detector confidence, not the recognition confidence */
  detectorScore: number;
}

/** Face quality gate — must pass before recognition runs. */
export interface QualityCheck {
  passed: boolean;
  /** Brightness: 0 (dark) – 1 (bright). Target 0.3–0.85. */
  brightness: number;
  /** Blur score: lower = blurrier. Target > 0.5. */
  sharpness: number;
  /** Face size relative to frame. Target > 0.15. */
  faceAreaRatio: number;
  /** Maps via qualityCheckTranslationKey() → src/locales qualityCheck.* */
  failReason?:
    | 'too_dark'
    | 'too_bright'
    | 'blurry'
    | 'too_small'
    | 'no_face'
    | 'multiple_faces'
    | 'face_angle_too_high'
    | 'occluded';
}

/** Result of a single liveness challenge. */
export interface LivenessResult {
  challenge: LivenessChallenge;
  passed: boolean;
  /** Eye aspect ratio reading (blink challenge) */
  ear?: number;
  /** Yaw angle in degrees (head-turn challenge) */
  yawDegrees?: number;
  durationMs: number;
}

/**
 * Output of the full recognition pipeline.
 * Returned by the RN native bridge runInference() call.
 * Owner: Sanyam (ML) — consumed by auth screens (Aahil).
 */
export interface RecognitionResult {
  /** null = no match above minimum threshold */
  workerId: UUID | null;
  /** Cosine similarity in [0, 1] */
  confidence: ConfidenceScore;
  authTier: AuthTier;
  qualityCheck: QualityCheck;
  /** 128-dim embedding as base64 (used internally, not stored) */
  embeddingBase64?: string;
  inferenceMs: number;
}

// ---------------------------------------------------------------------------
// Liveness session  (Aahil — auth screens)
// ---------------------------------------------------------------------------

/**
 * A complete liveness challenge session.
 * May contain 1–3 individual challenges depending on authTier.
 */
export interface LivenessSession {
  challenges: LivenessResult[];
  /** True if ALL required challenges passed */
  passed: boolean;
  /** Aggregate liveness score in [0, 1] */
  score: number;
  totalDurationMs: number;
}

// ---------------------------------------------------------------------------
// Supervisor confirmation  (Maulik — supervisor screens)
// ---------------------------------------------------------------------------

/**
 * Supervisor visual confirmation step.
 * Supervisor sees reference thumbnail + name/ID, taps Confirm or Reject.
 */
export interface SupervisorConfirmation {
  supervisorId: UUID;
  action: SupervisorAction;
  /** ISO timestamp of the tap */
  confirmedAt: ISOTimestamp;
}

// ---------------------------------------------------------------------------
// Attendance  (Anoushka — WatermelonDB + sync)
// ---------------------------------------------------------------------------

/**
 * Attendance record as stored in WatermelonDB.
 * Created after supervisor confirms. Synced to backend when online.
 */
export interface AttendanceRecord {
  id: UUID;
  workerId: UUID;
  siteId: UUID;
  deviceId: UUID;
  supervisorId: UUID;
  supervisorConfirmed: boolean;
  authTimestamp: ISOTimestamp;
  confidence: ConfidenceScore;
  authTier: AuthTier;
  livenessScore: number;
  livenessPassed: boolean;
  /** Last liveness challenge type (maps to challenge_type in Postgres) */
  challengeType?: LivenessChallenge;
  /** Last liveness challenge outcome (maps to challenge_result in Postgres) */
  challengeResult?: boolean;
  syncStatus: SyncStatus;
  /** Set after server ACK */
  serverRecordId?: UUID;
  /** Set by server-side edge function only */
  integrationPushStatus: IntegrationPushStatus;
  syncedAt?: ISOTimestamp;
  purgedAt?: ISOTimestamp;
  failReason?: string;
}

// ---------------------------------------------------------------------------
// Site Package  (Anoushka — sitePackage service)
// ---------------------------------------------------------------------------

/**
 * Decrypted site package held in memory after download.
 * The encrypted zip (AES-256-GCM) is stored on disk; this is the in-memory form.
 * Worker embeddings are NEVER exposed via REST — only in this package.
 */
export interface SitePackage {
  siteId: UUID;
  siteName: string;
  version: string;
  generatedAt: ISOTimestamp;
  expiresAt: ISOTimestamp;
  workers: WorkerEmbeddingEntry[];
}

/** One worker's entry inside the site package. */
export interface WorkerEmbeddingEntry {
  workerId: UUID;
  name: string;
  role: string;
  thumbnailBase64: string;
  /** Float32Array serialised as base64 — 128-dim cosine embedding */
  embeddingBase64: string;
  isRevoked: boolean;
}

// ---------------------------------------------------------------------------
// Registration  (Aahil + Maulik — registration flow)
// ---------------------------------------------------------------------------

/**
 * Registration request created during field enrollment.
 * Queued locally, synced to backend for admin review.
 */
export interface RegistrationRequest {
  id: UUID;
  name: string;
  role: string;
  aadhaarHash: string;
  siteId: UUID;
  /** 4 required + up to 2 optional PPE captures */
  capturedAngles: CaptureAngle[];
  /** Field registration uses pending_registration until first sync */
  status: 'pending' | 'pending_registration' | 'approved' | 'rejected';
  /** Optional — collected in admin portal; not in field flow */
  contactNumber?: string;
  submittedAt: ISOTimestamp;
  reviewedAt?: ISOTimestamp;
  reviewNote?: string;
}

/** Face capture angles collected during registration. */
export type CaptureAngle =
  | 'frontal'
  | 'left_30'
  | 'right_30'
  | 'up_tilt'
  | 'helmet_on'   // optional PPE
  | 'glasses_on'; // optional PPE

// ---------------------------------------------------------------------------
// Device  (Anoushka — device trust)
// ---------------------------------------------------------------------------

export interface DeviceInfo {
  id: UUID;
  /** Supervisor user ID bound to this device */
  supervisorId: UUID;
  siteId: UUID;
  platform: 'android' | 'ios';
  appVersion?: string;
  /** Maps from devices.last_sync_at */
  lastSyncAt?: ISOTimestamp;
  trustScore?: number;
  /** Maps from devices.revoked */
  isRevoked: boolean;
}

// ---------------------------------------------------------------------------
// Native bridge contracts  (Sanyam — FaceRecognition.kt / .swift)
// ---------------------------------------------------------------------------

/**
 * Input to the native TFLite bridge.
 * Frame is a 112×112 RGB crop, base64-encoded.
 */
export interface NativeInferenceInput {
  /** Base64 JPEG of the 112×112 face crop */
  faceFrameBase64: string;
  /** Site package entries to match against */
  candidates: WorkerEmbeddingEntry[];
  /** Minimum cosine similarity to report a match */
  threshold: number;
}

/**
 * Output of NativeModules.FaceRecognition.runInference()
 * Promise resolves with this shape.
 */
export interface NativeInferenceOutput {
  workerId: UUID | null;
  confidence: ConfidenceScore;
  inferenceMs: number;
  qualityScore: number;
}
