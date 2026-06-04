import type { LivenessChallenge, LivenessResult } from '@/types';

import { runLivenessChallengeStub } from '@/services/liveness/stub';

export { stubLivenessFailNext } from '@/services/liveness/stub';

/**
 * Run one liveness challenge. Swaps to native bridge when available.
 */
export async function runLivenessChallenge(
  challenge: LivenessChallenge,
): Promise<LivenessResult> {
  return runLivenessChallengeStub(challenge);
}
