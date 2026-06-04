/**
 * Face authentication thresholds — TFLite INT8, cosine similarity, Indian demographic.
 * Measured: 96.53% TAR / 0.54% FAR @ HIGH, 98.02% TAR / 2.69% FAR @ MEDIUM.
 * @see ml/PROGRESS_SANYAM.md for full benchmark table.
 */

/** High confidence — single liveness challenge. 96.53% TAR, 0.54% FAR. */
export const CONFIDENCE_THRESHOLD_HIGH = 0.3;

/** Medium confidence — two liveness challenges. 98.02% TAR, 2.69% FAR. */
export const CONFIDENCE_THRESHOLD_MEDIUM = 0.2;

/** Minimum score to report any match from the native bridge. */
export const CONFIDENCE_THRESHOLD_MINIMUM = 0.18;

/** Max liveness attempts before supervisor override prompt. */
export const LIVENESS_MAX_ATTEMPTS = 3;

/** Per-challenge timeout (ms). */
export const LIVENESS_CHALLENGE_TIMEOUT_MS = 5_000;

/** Delay before first liveness sample so the user can read the prompt (ms). */
export const LIVENESS_SAMPLE_START_DELAY_MS = 500;

/** Interval between liveness frame samples during the countdown (ms). */
export const LIVENESS_FRAME_SAMPLE_MS = 300;
