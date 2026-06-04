/**
 * Mock liveness challenges until native EAR/yaw bridge merges (Sanyam).
 */

import type {LivenessChallenge, LivenessResult} from '@/types';

let failNext = false;

/** Dev-only: next challenge will fail once (for testing retry UI). */
export function stubLivenessFailNext(): void {
  failNext = true;
}

export async function runLivenessChallengeStub(
  challenge: LivenessChallenge,
): Promise<LivenessResult> {
  const start = Date.now();
  await new Promise<void>(resolve => {
    setTimeout(() => resolve(), 600);
  });

  const shouldFail = failNext;
  failNext = false;

  const passed = !shouldFail;
  const durationMs = Date.now() - start;

  if (challenge === 'blink') {
    return {challenge, passed, ear: passed ? 0.28 : 0.12, durationMs};
  }
  return {
    challenge,
    passed,
    yawDegrees: passed ? (challenge === 'turn_left' ? -24 : 24) : 2,
    durationMs,
  };
}
