import type {LivenessChallenge} from '@/types';

/** Locale paths under the `liveness` namespace. */
export const LIVENESS_I18N_KEYS = {
  blink: 'liveness.instructionBlink',
  turn_left: 'liveness.instructionTurnLeft',
  turn_right: 'liveness.instructionTurnRight',
} as const satisfies Record<LivenessChallenge, string>;

export function livenessInstructionKey(challenge: LivenessChallenge): string {
  return LIVENESS_I18N_KEYS[challenge];
}
