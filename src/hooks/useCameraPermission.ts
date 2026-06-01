import { useEffect, useState } from 'react';
import { Camera } from 'react-native-vision-camera';

export function useCameraPermission(): {
  hasPermission: boolean;
  isRequesting: boolean;
} {
  const [hasPermission, setHasPermission] = useState(false);
  const [isRequesting, setIsRequesting] = useState(true);

  useEffect(() => {
    void (async () => {
      const current = await Camera.getCameraPermissionStatus();
      if (current === 'granted') {
        setHasPermission(true);
        setIsRequesting(false);
        return;
      }
      const requested = await Camera.requestCameraPermission();
      setHasPermission(requested === 'granted');
      setIsRequesting(false);
    })();
  }, []);

  return { hasPermission, isRequesting };
}
