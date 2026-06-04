import type {LivenessResult, LivenessSession} from '@/types';

/** Aggregate per-challenge results into a session for attendance / pending-auth. */
export function buildLivenessSession(
  challenges: LivenessResult[],
): LivenessSession {
  const passed = challenges.length > 0 && challenges.every(c => c.passed);
  const totalDurationMs = challenges.reduce((s, c) => s + c.durationMs, 0);
  const score =
    challenges.length === 0
      ? 0
      : challenges.filter(c => c.passed).length / challenges.length;

  return {
    challenges,
    passed,
    score,
    totalDurationMs,
  };
}
