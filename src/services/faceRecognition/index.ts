import {NativeModules} from 'react-native';

import {authTierFromConfidence} from '@/lib/authTier';
import {CONFIDENCE_THRESHOLD_MINIMUM} from '@/constants/auth';
import type {
  QualityCheck,
  RecognitionResult,
  LivenessResult,
  LivenessChallenge,
  WorkerEmbeddingEntry,
} from '@/types';
import {
  runQualityCheckStub,
  runRecognitionStub,
  STUB_FACE_BOX,
} from '@/services/faceRecognition/stub';

export {STUB_FACE_BOX};

const {FaceRecognition} = NativeModules;

/** True when the native TFLite bridge is available (Android + iOS production builds). */
export const BRIDGE_AVAILABLE = !!FaceRecognition;

// ─── Embedding Generation (enrollment + field registration) ──────────────────

/**
 * Detect face, run MobileFaceNet, L2-normalise, and return the 512-d embedding
 * as base64-encoded float32-LE bytes (2048 bytes raw, ~2732 chars base64).
 *
 * Call this during enrollment and field registration to produce the embedding
 * stored in WatermelonDB and synced to Supabase via register-worker.
 * NOT used during auth — auth uses runRecognition which matches inside the bridge.
 */
export async function generateEmbedding(frameBase64: string): Promise<{
  embeddingBase64: string | null;
  qualityScore: number;
  faceFound: boolean;
}> {
  if (!BRIDGE_AVAILABLE) {
    if (__DEV__) console.log('[FaceRecognition] generateEmbedding: bridge unavailable — stub');
    return { embeddingBase64: null, qualityScore: 0, faceFound: false };
  }
  if (__DEV__) console.log('[FaceRecognition] generateEmbedding: native bridge');
  return FaceRecognition.generateEmbedding(frameBase64);
}

// ─── Face Quality Check ───────────────────────────────────────────────────────

/**
 * Detect face in frame and return quality metrics.
 *
 * @param frameBase64  Base64 JPEG of the current camera frame (any resolution).
 *                     When omitted (dev / web) falls back to stub.
 */
export async function checkFaceQuality(
  frameBase64?: string,
): Promise<QualityCheck> {
  if (!BRIDGE_AVAILABLE || !frameBase64) {
    return runQualityCheckStub();
  }
  return FaceRecognition.checkFaceQuality(frameBase64);
}

// ─── Face Recognition ─────────────────────────────────────────────────────────

/**
 * Detect face, crop, embed, and match against enrolled workers.
 * The native bridge handles face detection + cropping internally.
 *
 * @param frameBase64  Base64 JPEG of the current camera frame (any resolution).
 * @param candidates   Workers from the decrypted site package.
 */
export async function runRecognition(
  frameBase64?: string,
  candidates?: WorkerEmbeddingEntry[],
): Promise<RecognitionResult> {
  if (!BRIDGE_AVAILABLE || !frameBase64 || !candidates?.length) {
    return runRecognitionStub();
  }

  const raw: {
    workerId: string | null;
    confidence: number;
    inferenceMs: number;
    qualityScore: number;
  } = await FaceRecognition.runInference(
    frameBase64,
    JSON.stringify(candidates),
    CONFIDENCE_THRESHOLD_MINIMUM,
  );

  return {
    workerId: raw.workerId ?? null,
    confidence: raw.confidence,
    authTier: authTierFromConfidence(raw.confidence),
    qualityCheck: {
      passed: true,
      brightness: 0.6,
      sharpness: 0.7,
      faceAreaRatio: 0.35,
    },
    inferenceMs: raw.inferenceMs,
  };
}

// ─── Liveness Detection ───────────────────────────────────────────────────────

/**
 * Evaluate a single liveness challenge across a sequence of camera frames.
 *
 * @param framesBase64  Base64 JPEG frames captured during the challenge window.
 * @param challenge     "blink" | "turn_left" | "turn_right"
 */
export async function checkLiveness(
  framesBase64: string[],
  challenge: LivenessChallenge,
): Promise<LivenessResult> {
  if (!BRIDGE_AVAILABLE || framesBase64.length === 0) {
    return {challenge, passed: true, durationMs: 0};
  }

  const raw: {
    passed: boolean;
    ear?: number;
    yawDegrees?: number;
    durationMs: number;
  } = await FaceRecognition.checkLiveness(framesBase64, challenge);

  return {
    challenge,
    passed: raw.passed,
    ear: raw.ear,
    yawDegrees: raw.yawDegrees,
    durationMs: raw.durationMs,
  };
}
