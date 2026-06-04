import type {AuthTier, ConfidenceScore} from '@/types';
import {
  CONFIDENCE_THRESHOLD_HIGH,
  CONFIDENCE_THRESHOLD_MEDIUM,
} from '@/constants/auth';

/** Map recognition confidence to adaptive-auth tier. */
export function authTierFromConfidence(confidence: ConfidenceScore): AuthTier {
  if (confidence > CONFIDENCE_THRESHOLD_HIGH) {
    return 'high';
  }
  if (confidence >= CONFIDENCE_THRESHOLD_MEDIUM) {
    return 'medium';
  }
  return 'low';
}

/** Number of liveness challenges required for this tier. */
export function requiredLivenessChallengeCount(tier: AuthTier): number {
  switch (tier) {
    case 'high':
      return 1;
    case 'medium':
      return 2;
    case 'low':
      return 3;
  }
}

/** Low-confidence matches should flag the supervisor during confirmation. */
export function requiresSupervisorFlag(tier: AuthTier): boolean {
  return tier === 'low';
}
