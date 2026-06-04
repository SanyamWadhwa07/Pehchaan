/**
 * Mock face pipeline for Day 1 UI development.
 * Replace with NativeModules.FaceRecognition when Sanyam merges the bridge.
 */

import {authTierFromConfidence} from '@/lib/authTier';
import type {FaceDetection, QualityCheck, RecognitionResult} from '@/types';

/** Placeholder face box (normalised 0–1) centred on frame. */
export const STUB_FACE_BOX: FaceDetection['box'] = {
  x: 0.22,
  y: 0.18,
  width: 0.56,
  height: 0.64,
};

const STUB_FAIL_REASONS: NonNullable<QualityCheck['failReason']>[] = [
  'no_face',
  'too_dark',
  'blurry',
  'face_angle_too_high',
];

let tick = 0;

export function runQualityCheckStub(): QualityCheck {
  tick += 1;
  const cycle = tick % 6;

  if (cycle === 0) {
    return {
      passed: true,
      brightness: 0.55,
      sharpness: 0.72,
      faceAreaRatio: 0.42,
    };
  }

  const failReason = STUB_FAIL_REASONS[tick % STUB_FAIL_REASONS.length]!;
  return {
    passed: false,
    brightness: 0.25,
    sharpness: 0.3,
    faceAreaRatio: 0.08,
    failReason,
  };
}

export function runRecognitionStub(): RecognitionResult {
  const qualityCheck = runQualityCheckStub();
  const confidence = qualityCheck.passed ? 0.94 : 0.72;

  return {
    workerId: qualityCheck.passed
      ? '00000000-0000-4000-8000-000000000001'
      : null,
    confidence,
    authTier: authTierFromConfidence(confidence),
    qualityCheck,
    inferenceMs: 48,
  };
}
