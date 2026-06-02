import { useIsFocused } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

function cameraErrorCode(error: unknown): string {
  if (error == null || typeof error !== 'object') {
    return '';
  }
  return 'code' in error ? String((error as { code: unknown }).code) : '';
}

function cameraErrorMessage(error: unknown): string {
  if (error == null || typeof error !== 'object') {
    return '';
  }
  return 'message' in error
    ? String((error as { message: unknown }).message)
    : '';
}

export function useCameraSession(): {
  isActive: boolean;
  onCameraError: (error: unknown) => void;
} {
  const isFocused = useIsFocused();
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const sub = AppState.addEventListener('change', setAppState);
    return () => sub.remove();
  }, []);

  const isActive = isFocused && appState === 'active';

  const onCameraError = useCallback(
    (error: unknown) => {
      const code = cameraErrorCode(error);
      const message = cameraErrorMessage(error);

      if (__DEV__) {
        console.warn('Camera.onError', { code, message, isFocused, appState });
      }
    },
    [isFocused, appState],
  );

  return { isActive, onCameraError };
}
