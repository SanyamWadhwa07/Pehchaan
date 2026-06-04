import React, {createContext, useCallback, useContext, useState} from 'react';

import type {AppLanguage} from '@/i18n';

export type FieldRegistrationState = {
  workerName: string;
  role: string;
  contactNumber: string;
  aadhaarHash: string;
  languagePreference: AppLanguage;
  frontalCaptureBase64: string;
};

export const initialFieldRegistrationState = (): FieldRegistrationState => ({
  workerName: '',
  role: '',
  contactNumber: '',
  aadhaarHash: '',
  languagePreference: 'en',
  frontalCaptureBase64: '',
});

type ContextValue = {
  state: FieldRegistrationState;
  updateState: (patch: Partial<FieldRegistrationState>) => void;
  reset: () => void;
};

const RegistrationContext = createContext<ContextValue | null>(null);

export function RegistrationProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const [state, setState] = useState<FieldRegistrationState>(
    initialFieldRegistrationState,
  );

  const updateState = useCallback((patch: Partial<FieldRegistrationState>) => {
    setState(s => ({...s, ...patch}));
  }, []);

  const reset = useCallback(() => {
    setState(initialFieldRegistrationState());
  }, []);

  return (
    <RegistrationContext.Provider value={{state, updateState, reset}}>
      {children}
    </RegistrationContext.Provider>
  );
}

export function useFieldRegistration(): ContextValue {
  const ctx = useContext(RegistrationContext);
  if (!ctx) {
    throw new Error(
      'useFieldRegistration must be used within RegistrationProvider',
    );
  }
  return ctx;
}
