/**
 * Face recognition service — swap stub for native bridge when available.
 */

import type { QualityCheck, RecognitionResult } from '@/types';

import {
  runQualityCheckStub,
  runRecognitionStub,
  STUB_FACE_BOX,
} from '@/services/faceRecognition/stub';

export { STUB_FACE_BOX };

export async function checkFaceQuality(): Promise<QualityCheck> {
  return runQualityCheckStub();
}

export async function runRecognition(): Promise<RecognitionResult> {
  return runRecognitionStub();
}
