import type { QualityCheck } from '@/types';

/** Locale paths under the `qualityCheck` namespace in en.json / hi.json. */
export const QUALITY_CHECK_I18N_KEYS = {
  too_dark: 'qualityCheck.tooDark',
  too_bright: 'qualityCheck.tooBright',
  blurry: 'qualityCheck.tooBlurry',
  too_small: 'qualityCheck.tooSmall',
  no_face: 'qualityCheck.faceNotDetected',
  multiple_faces: 'qualityCheck.multipleFaces',
  face_angle_too_high: 'qualityCheck.faceAngleTooHigh',
  occluded: 'qualityCheck.occluded',
} as const satisfies Record<
  NonNullable<QualityCheck['failReason']>,
  string
>;

export function qualityCheckTranslationKey(
  failReason: NonNullable<QualityCheck['failReason']>,
): string {
  return QUALITY_CHECK_I18N_KEYS[failReason];
}
