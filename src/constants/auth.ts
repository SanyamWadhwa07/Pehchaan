/**
 * Face authentication thresholds (Indian demographic model, cosine similarity).
 * @see CLAUDE.md — Adaptive auth
 */

/** Match with high confidence — single liveness challenge. */
export const CONFIDENCE_THRESHOLD_HIGH = 0.92;

/** Match with medium confidence — two liveness challenges. */
export const CONFIDENCE_THRESHOLD_MEDIUM = 0.8;

/** Minimum score to report any match from the native bridge. */
export const CONFIDENCE_THRESHOLD_MINIMUM = 0.75;

/** Max liveness attempts before supervisor override prompt. */
export const LIVENESS_MAX_ATTEMPTS = 3;

/** Per-challenge timeout (ms). */
export const LIVENESS_CHALLENGE_TIMEOUT_MS = 5_000;
