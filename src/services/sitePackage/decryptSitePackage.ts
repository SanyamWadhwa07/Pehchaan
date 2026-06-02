import { gcm } from '@noble/ciphers/aes.js';
import { sha256 } from 'js-sha256';

import type { SitePackageManifestV2Outer } from '@/services/sitePackage/sitePackageManifest';
import { parseSitePackageInnerPayload } from '@/services/sitePackage/sitePackageManifest';

const MAX_INNER_BYTES = 25 * 1024 * 1024;

/** Decode standard base64 → `Uint8Array` (React Native). */
export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/\s/g, '');
  if (typeof globalThis.atob === 'function') {
    const bin = globalThis.atob(clean);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      out[i] = bin.charCodeAt(i);
    }
    return out;
  }
  throw new Error('atob is not available in this runtime');
}

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof globalThis.btoa === 'function') {
    let bin = '';
    const chunk = 8192;
    for (let i = 0; i < bytes.length; i += chunk) {
      const slice = bytes.subarray(i, Math.min(i + chunk, bytes.length));
      bin += String.fromCharCode.apply(null, Array.from(slice) as unknown as number[]);
    }
    return globalThis.btoa(bin);
  }
  throw new Error('btoa is not available in this runtime');
}

export function bytesToUtf8(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    s += String.fromCharCode(bytes[i]!);
  }
  return s;
}

/**
 * AES-256-GCM open: wire format `iv(12) || ciphertext` (ciphertext includes auth tag, Noble layout).
 */
export function aesGcm256Open(key32: Uint8Array, ivAndSealed: Uint8Array): Uint8Array {
  if (key32.length !== 32) {
    throw new Error('AES-256-GCM requires a 32-byte key');
  }
  if (ivAndSealed.length < 13) {
    throw new Error('truncated AES-GCM blob');
  }
  const iv = ivAndSealed.subarray(0, 12);
  const sealed = ivAndSealed.subarray(12);
  return gcm(key32, iv).decrypt(sealed);
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^\\x/i, '').replace(/^0x/i, '').replace(/\s/g, '');
  if (clean.length % 2 !== 0) {
    throw new Error('invalid hex length');
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Decode `SITE_PACKAGE_MASTER_KEY` (32-byte raw as standard base64). */
export function decodeSitePackageMasterKey(b64: string): Uint8Array {
  const k = base64ToBytes(b64.trim());
  if (k.length !== 32) {
    throw new Error('SITE_PACKAGE_MASTER_KEY must decode to exactly 32 bytes');
  }
  return k;
}

/**
 * Optional outer-layer decrypt for whole-buffer encryption (reserved).
 * v2 packages keep outer zip plaintext; only `payload.bin` is encrypted.
 */
export async function decryptSitePackageBuffer(
  buffer: ArrayBuffer,
  _keyBase64?: string | undefined,
): Promise<ArrayBuffer> {
  if (_keyBase64 && _keyBase64.length > 0) {
    throw new Error(
      'Whole-buffer site package encryption is not implemented — use v2 inner payload.bin only.',
    );
  }
  return buffer;
}

function sha256HexOfBytes(data: Uint8Array): string {
  const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  const digest = sha256.arrayBuffer(buf as ArrayBuffer) as ArrayBuffer;
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function verifySha256Hex(payload: Uint8Array, expectedHexLower: string): void {
  const hex = sha256HexOfBytes(payload);
  if (hex !== expectedHexLower.toLowerCase()) {
    throw new Error('payload.sha256 mismatch — refusing to decrypt');
  }
}

/**
 * Key material for decrypting a v2 site package.
 * - `site_master`: the shared 32-byte site master key (`SITE_PACKAGE_MASTER_KEY`).
 * - `per_device`: a device-specific 32-byte key provisioned during onboarding.
 */
export type SitePackageKeyMaterial =
  | { kind: 'site_master'; key32: Uint8Array }
  | { kind: 'per_device'; deviceId: string; key32: Uint8Array };

/**
 * Resolve the wrapped data key from a v2 outer manifest using the provided key material.
 * - `site_master_v1` envelope: expects `keyMaterial.kind === 'site_master'`.
 * - `per_device_v1` envelope: expects `keyMaterial.kind === 'per_device'`;
 *   looks up the device's own entry in `device_envelopes`.
 */
function resolveDataKey(
  outer: SitePackageManifestV2Outer,
  keyMaterial: SitePackageKeyMaterial,
): Uint8Array {
  const envelopeKind = outer.key_envelope.kind;

  if (envelopeKind === 'site_master_v1') {
    if (keyMaterial.kind !== 'site_master') {
      throw new Error(
        'site_master_v1 envelope requires SitePackageKeyMaterial.kind === "site_master"',
      );
    }
    const wrap = base64ToBytes(
      (outer.key_envelope as { kind: 'site_master_v1'; wrap_blob_b64: string }).wrap_blob_b64,
    );
    const dataKey = aesGcm256Open(keyMaterial.key32, wrap);
    if (dataKey.length !== 32) {
      throw new Error('unwrapped data key must be 32 bytes');
    }
    return dataKey;
  }

  if (envelopeKind === 'per_device_v1') {
    if (keyMaterial.kind !== 'per_device') {
      throw new Error(
        'per_device_v1 envelope requires SitePackageKeyMaterial.kind === "per_device"',
      );
    }
    const envelopes = outer.device_envelopes;
    if (!envelopes || envelopes.length === 0) {
      throw new Error('per_device_v1 manifest has no device_envelopes');
    }
    const entry = envelopes.find((e) => e.device_id === keyMaterial.deviceId);
    if (!entry) {
      throw new Error(
        `per_device_v1: no envelope found for device_id "${keyMaterial.deviceId}"`,
      );
    }
    const wrap = base64ToBytes(entry.wrap_blob_b64);
    const dataKey = aesGcm256Open(keyMaterial.key32, wrap);
    if (dataKey.length !== 32) {
      throw new Error('unwrapped data key must be 32 bytes');
    }
    return dataKey;
  }

  throw new Error(`unsupported key_envelope.kind: ${String(envelopeKind)}`);
}

/**
 * Decrypt v2 `payload.bin`: resolve data key via key material → AES-GCM decrypt → parse inner JSON.
 */
export function decryptSitePackageV2Payload(
  outer: SitePackageManifestV2Outer,
  payloadBin: Uint8Array,
  keyMaterial: SitePackageKeyMaterial,
): ReturnType<typeof parseSitePackageInnerPayload> {
  if (payloadBin.byteLength > MAX_INNER_BYTES) {
    throw new Error('payload.bin exceeds maximum allowed size');
  }
  verifySha256Hex(payloadBin, outer.payload.sha256);
  if (payloadBin.byteLength !== outer.payload.size_bytes) {
    throw new Error('payload size_bytes mismatch');
  }

  const dataKey = resolveDataKey(outer, keyMaterial);

  const innerBytes = aesGcm256Open(dataKey, payloadBin);
  if (innerBytes.byteLength > MAX_INNER_BYTES) {
    throw new Error('inner plaintext exceeds maximum allowed size');
  }

  const text = bytesToUtf8(innerBytes);
  let innerJson: unknown;
  try {
    innerJson = JSON.parse(text) as unknown;
  } catch {
    throw new Error('inner payload is not valid JSON');
  }
  return parseSitePackageInnerPayload(innerJson);
}

/** Postgres / Supabase `bytea` → standard base64 string for JSON inner payload. */
export function byteaFieldToBase64(v: unknown): string | null {
  if (v == null) {
    return null;
  }
  if (typeof v === 'string') {
    if (v.startsWith('\\x') || v.startsWith('\\X')) {
      const bytes = hexToBytes(v.slice(2));
      return bytesToBase64(bytes);
    }
    return v;
  }
  if (v instanceof Uint8Array) {
    return bytesToBase64(v);
  }
  return null;
}
