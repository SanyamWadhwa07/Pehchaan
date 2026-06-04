import RNFS from 'react-native-fs';

/** Strip data-URL prefix before writing raw JPEG bytes. */
function normalizeCaptureBase64(captureBase64: string): string {
  const trimmed = captureBase64.trim();
  const comma = trimmed.indexOf(',');
  if (trimmed.startsWith('data:') && comma >= 0) {
    return trimmed.slice(comma + 1);
  }
  return trimmed;
}

/**
 * Persist a large frontal JPEG outside SQLite (avoids "row too big for CursorWindow").
 * Returns an absolute path under the app documents directory.
 */
export async function persistFrontalCaptureToFile(
  siteId: string,
  localWorkerId: string,
  captureBase64: string,
): Promise<string> {
  const safeSite = siteId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeWorker = localWorkerId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const dir = `${RNFS.DocumentDirectoryPath}/registration-captures/${safeSite}/${safeWorker}`;
  await RNFS.mkdir(dir);
  const path = `${dir}/frontal.jpg`;
  await RNFS.writeFile(path, normalizeCaptureBase64(captureBase64), 'base64');
  return path;
}
