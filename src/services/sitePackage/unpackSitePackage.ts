import { strFromU8, unzipSync } from 'fflate';

import {
  parseSitePackageManifest,
  parseSitePackageManifestV2Outer,
  type ParsedSitePackage,
} from '@/services/sitePackage/sitePackageManifest';

function readManifestJson(files: Record<string, Uint8Array>): unknown {
  const manifestBytes = files['manifest.json'];
  if (!manifestBytes) {
    const keys = Object.keys(files);
    throw new Error(
      keys.length
        ? `site package missing manifest.json (zip has: ${keys.slice(0, 8).join(', ')})`
        : 'site package zip is empty',
    );
  }
  const text = strFromU8(manifestBytes);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error('manifest.json is not valid JSON');
  }
}

export function unzipSitePackageFiles(buffer: ArrayBuffer): Record<string, Uint8Array> {
  return unzipSync(new Uint8Array(buffer), { filter: () => true });
}

export function parseSitePackageFromZipBuffer(buffer: ArrayBuffer): ParsedSitePackage {
  const files = unzipSitePackageFiles(buffer);
  const parsed = readManifestJson(files);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('manifest: invalid');
  }
  const ver = (parsed as Record<string, unknown>).version;
  if (ver === 2) {
    return { kind: 'v2_encrypted', outer: parseSitePackageManifestV2Outer(parsed), files };
  }
  return { kind: 'v1_plain', manifest: parseSitePackageManifest(parsed) };
}

/** @deprecated use `parseSitePackageFromZipBuffer` */
export function unpackSitePackageZip(buffer: ArrayBuffer) {
  const p = parseSitePackageFromZipBuffer(buffer);
  if (p.kind !== 'v1_plain') {
    throw new Error('unpackSitePackageZip: expected v1 plaintext package');
  }
  return p.manifest;
}
