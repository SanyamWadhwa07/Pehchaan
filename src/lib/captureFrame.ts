import {useCallback, useRef, type RefObject} from 'react';
import RNFS from 'react-native-fs';
import type {Camera} from 'react-native-vision-camera';

function normalizePhotoPath(path: string): string {
  return path.startsWith('file://') ? path.replace('file://', '') : path;
}

/**
 * Capture one JPEG frame from the active camera as base64 (no data-URL prefix).
 * Returns null on failure so callers can fall back to ML stubs.
 */
export async function captureFrameBase64(
  cameraRef: RefObject<Camera | null>,
): Promise<string | null> {
  try {
    const camera = cameraRef.current;
    if (!camera) {
      return null;
    }

    const photo = await camera.takePhoto({
      flash: 'off',
      enableShutterSound: false,
    });

    const path = normalizePhotoPath(photo.path);
    const base64 = await RNFS.readFile(path, 'base64');

    void RNFS.unlink(path).catch(() => {
      // Best-effort temp file cleanup.
    });

    return base64.length > 0 ? base64 : null;
  } catch (err) {
    if (__DEV__) {
      console.warn('[captureFrame] failed:', err);
    }
    return null;
  }
}

/**
 * Capture multiple frames spaced for liveness (blink / head-turn) analysis.
 */
export async function captureFrameBurstBase64(
  cameraRef: RefObject<Camera | null>,
  count: number,
  intervalMs: number,
): Promise<string[]> {
  const frames: string[] = [];
  for (let i = 0; i < count; i++) {
    const frame = await captureFrameBase64(cameraRef);
    if (frame) {
      frames.push(frame);
    }
    if (i < count - 1 && intervalMs > 0) {
      await new Promise<void>(resolve => {
        setTimeout(resolve, intervalMs);
      });
    }
  }
  return frames;
}

/** Prevent overlapping takePhoto calls when polling quality. */
export function useCaptureInFlight(): {
  tryAcquire: () => boolean;
  release: () => void;
} {
  const inFlightRef = useRef(false);
  const tryAcquire = useCallback(() => {
    if (inFlightRef.current) {
      return false;
    }
    inFlightRef.current = true;
    return true;
  }, []);
  const release = useCallback(() => {
    inFlightRef.current = false;
  }, []);
  return {tryAcquire, release};
}
