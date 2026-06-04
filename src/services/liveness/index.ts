import type {LivenessChallenge, LivenessResult} from '@/types';
import {checkLiveness} from '@/services/faceRecognition';

import {runLivenessChallengeStub} from '@/services/liveness/stub';

export {stubLivenessFailNext} from '@/services/liveness/stub';

/**
 * Run one liveness challenge. Uses native bridge when frames are provided; else stub.
 */
export async function runLivenessChallenge(
  challenge: LivenessChallenge,
  framesBase64?: string[],
): Promise<LivenessResult> {
  if (framesBase64 && framesBase64.length > 0) {
    return checkLiveness(framesBase64, challenge);
  }
  return runLivenessChallengeStub(challenge);
}
