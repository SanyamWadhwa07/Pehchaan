import type {AppLanguage} from '@/i18n';
import type {CaptureAngle} from '@/types';

export const REQUIRED_CAPTURE_ANGLES: CaptureAngle[] = [
  'frontal',
  'left_30',
  'right_30',
  'up_tilt',
];

export const OPTIONAL_CAPTURE_ANGLES: CaptureAngle[] = [
  'helmet_on',
  'glasses_on',
];

export const CAPTURE_SEQUENCE: CaptureAngle[] = [
  ...REQUIRED_CAPTURE_ANGLES,
  ...OPTIONAL_CAPTURE_ANGLES,
];

export type EnrollmentWizardState = {
  name: string;
  role: string;
  contactNumber: string;
  languagePreference: AppLanguage;
  aadhaarHash: string;
  captures: Partial<Record<CaptureAngle, string>>;
  thumbnailBase64: string;
};

export const initialEnrollmentState = (): EnrollmentWizardState => ({
  name: '',
  role: '',
  contactNumber: '',
  languagePreference: 'en',
  aadhaarHash: '',
  captures: {},
  thumbnailBase64: '',
});
