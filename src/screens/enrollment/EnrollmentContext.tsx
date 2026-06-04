import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  initialEnrollmentState,
  type EnrollmentWizardState,
} from '@/screens/enrollment/types';

type EnrollmentContextValue = {
  state: EnrollmentWizardState;
  updateState: (patch: Partial<EnrollmentWizardState>) => void;
  reset: () => void;
};

const EnrollmentContext = createContext<EnrollmentContextValue | null>(null);

export function EnrollmentProvider({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  const [state, setState] = useState<EnrollmentWizardState>(initialEnrollmentState);

  const updateState = useCallback((patch: Partial<EnrollmentWizardState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  const reset = useCallback(() => {
    setState(initialEnrollmentState());
  }, []);

  const value = useMemo(
    () => ({ state, updateState, reset }),
    [state, updateState, reset],
  );

  return (
    <EnrollmentContext.Provider value={value}>{children}</EnrollmentContext.Provider>
  );
}

export function useEnrollment(): EnrollmentContextValue {
  const ctx = useContext(EnrollmentContext);
  if (!ctx) {
    throw new Error('useEnrollment must be used within EnrollmentProvider');
  }
  return ctx;
}
