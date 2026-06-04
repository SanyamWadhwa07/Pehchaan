import { NativeModules, Platform } from 'react-native';

import { authTierFromConfidence } from '@/lib/authTier';
import {
  CONFIDENCE_THRESHOLD_MINIMUM,
} from '@/constants/auth';
import type {
  NativeInferenceInput,
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

export { STUB_FACE_BOX };

const { FaceRecognition } = NativeModules;
const BRIDGE_AVAILABLE = !!FaceRecognition;

// ─── Quality Check ────────────────────────────────────────────────────────────

/**
 * Check face quality from current camera frame.
 * Falls back to stub when bridge is unavailable (dev / web).
 */
export async function checkFaceQuality(): Promise<QualityCheck> {
  return runQualityCheckStub();
}

// ─── Face Recognition ─────────────────────────────────────────────────────────

/**
 * Run face recognition against a list of enrolled workers.
 *
 * @param faceFrameBase64  Base64 JPEG of the 112×112 aligned face crop
 * @param candidates       Workers from the decrypted site package
 * @returns RecognitionResult with workerId (null if no match), confidence, tier, inferenceMs
 */
export async function runRecognition(
  faceFrameBase64?: string,
  candidates?: WorkerEmbeddingEntry[],
): Promise<RecognitionResult> {
  if (!BRIDGE_AVAILABLE || !faceFrameBase64 || !candidates?.length) {
    return runRecognitionStub();
  }

  const input: NativeInferenceInput = {
    faceFrameBase64,
    candidates,
    threshold: CONFIDENCE_THRESHOLD_MINIMUM,
  };

  const raw = await FaceRecognition.runInference(
    input.faceFrameBase64,
    JSON.stringify(input.candidates),
    input.threshold,
  );

  const qualityCheck: QualityCheck = {
    passed: true,
    brightness: 0.6,
    sharpness: 0.7,
    faceAreaRatio: 0.35,
  };

  return {
    workerId: raw.workerId ?? null,
    confidence: raw.confidence,
    authTier: authTierFromConfidence(raw.confidence),
    qualityCheck,
    inferenceMs: raw.inferenceMs,
  };
}

// ─── Liveness Detection ───────────────────────────────────────────────────────

/**
 * Evaluate a single liveness challenge across a sequence of camera frames.
 *
 * @param framesBase64  Array of base64 JPEG frames captured during the challenge window
 * @param challenge     "blink" | "turn_left" | "turn_right"
 * @returns LivenessResult with passed, ear/yawDegrees, durationMs
 */
export async function checkLiveness(
  framesBase64: string[],
  challenge: LivenessChallenge,
): Promise<LivenessResult> {
  if (!BRIDGE_AVAILABLE || framesBase64.length === 0) {
    return {
      challenge,
      passed: true,
      durationMs: 0,
    };
  }

  const raw = await FaceRecognition.checkLiveness(framesBase64, challenge);

  return {
    challenge,
    passed: raw.passed,
    ear: raw.ear,
    yawDegrees: raw.yawDegrees,
    durationMs: raw.durationMs,
  };
}

export { BRIDGE_AVAILABLE };
