/**
 * NHAI / Pehchaan brand palette.
 * Use primary + accent + neutrals for ~90% of UI; status colors for feedback only.
 */

export const colors = {
  /** Deep Corporate Blue — headers, nav, secondary actions */
  primary: '#003366',
  /** National Saffron — primary CTAs (Next, Submit, Retry) */
  accent: '#F48220',

  background: '#F5F7FA',
  surface: '#FFFFFF',

  text: '#111111',
  textSecondary: '#333333',
  textMuted: '#757575',

  success: '#2E7D32',
  warning: '#EF6C00',
  error: '#C62828',

  /** Text on primary/accent filled buttons */
  onPrimary: '#FFFFFF',
  onAccent: '#FFFFFF',

  /** Derived — borders, dividers, disabled */
  border: 'rgba(17, 17, 17, 0.12)',
  borderStrong: 'rgba(0, 51, 102, 0.25)',
  disabled: 'rgba(117, 117, 117, 0.4)',

  /** Camera overlays */
  overlay: 'rgba(0, 51, 102, 0.72)',
  panelOnCamera: '#FFFFFF',

  faceBox: '#2E7D32',
  faceBoxFail: '#C62828',
} as const;
