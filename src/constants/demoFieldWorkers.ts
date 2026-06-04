import type {AppLanguage} from '@/i18n';

export type DemoFieldWorkerPreset = {
  workerName: string;
  role: string;
  languagePreference: AppLanguage;
};

/** Dev-only presets for field registration demo (Hindi names). */
export const DEMO_FIELD_WORKER_PRESETS: DemoFieldWorkerPreset[] = [
  {
    workerName: 'राजेश कुमार',
    role: 'Mason',
    languagePreference: 'hi',
  },
  {
    workerName: 'सुनीता देवी',
    role: 'Helper',
    languagePreference: 'hi',
  },
  {
    workerName: 'अमित शर्मा',
    role: 'Electrician',
    languagePreference: 'hi',
  },
];
