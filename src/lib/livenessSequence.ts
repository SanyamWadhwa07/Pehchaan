import type {AuthTier, LivenessChallenge} from '@/types';

import {requiredLivenessChallengeCount} from '@/lib/authTier';

const CHALLENGE_ORDER: LivenessChallenge[] = [
  'blink',
  'turn_left',
  'turn_right',
];

/** Challenges required for the given auth tier (1–3). */
export function livenessChallengesForTier(tier: AuthTier): LivenessChallenge[] {
  const count = requiredLivenessChallengeCount(tier);
  return CHALLENGE_ORDER.slice(0, count);
}
