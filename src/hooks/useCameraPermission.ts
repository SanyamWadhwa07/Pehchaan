import {useEffect, useState} from 'react';
import {Camera} from 'react-native-vision-camera';

export async function ensureCameraPermission(): Promise<boolean> {
  const current = await Camera.getCameraPermissionStatus();
  if (current === 'granted') {
    return true;
  }
  const requested = await Camera.requestCameraPermission();
  return requested === 'granted';
}

type UseCameraPermissionOptions = {
  /** When false, only reads status (e.g. welcome screen). Default true. */
  autoRequest?: boolean;
};

export function useCameraPermission(options: UseCameraPermissionOptions = {}): {
  hasPermission: boolean;
  isRequesting: boolean;
} {
  const {autoRequest = true} = options;
  const [hasPermission, setHasPermission] = useState(false);
  const [isRequesting, setIsRequesting] = useState(autoRequest);

  useEffect(() => {
    void (async () => {
      const current = await Camera.getCameraPermissionStatus();
      if (current === 'granted') {
        setHasPermission(true);
        setIsRequesting(false);
        return;
      }
      if (!autoRequest) {
        setHasPermission(false);
        setIsRequesting(false);
        return;
      }
      const requested = await Camera.requestCameraPermission();
      setHasPermission(requested === 'granted');
      setIsRequesting(false);
    })();
  }, [autoRequest]);

  return {hasPermission, isRequesting};
}
