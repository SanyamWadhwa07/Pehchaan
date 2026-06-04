/**
 * Site package manifest — v1 plaintext workers in zip; v2 encrypted inner payload (`payload.bin`).
 */

export type SitePackageManifestV1 = {
  version: 1;
  cipher?: 'none' | 'aes-256-gcm';
  generated_at: string;
  site_id: string;
  workers: SitePackageWorkerManifestV1[];
};

export type SitePackageWorkerManifestV1 = {
  id: string;
  name: string;
  role: string;
  site_id: string;
  reference_thumbnail_url: string | null;
  enrolled_at: string;
  revoked_at: string | null;
  language_preference: 'en' | 'hi';
};

/** v2 outer `manifest.json` (plaintext). Worker blobs live inside decrypted inner JSON. */
export type SitePackageManifestV2Outer = {
  version: 2;
  cipher: 'aes-256-gcm';
  generated_at: string;
  site_id: string;
  package_version: number;
  package_format: 'full' | 'incremental';
  previous_package_version?: number | null;
  /**
   * Discriminated union:
   * - `site_master_v1`: single wrapped data key; `wrap_blob_b64` = `iv(12) || gcm_seal(data_key)`.
   * - `per_device_v1`: one wrapped key per device in `device_envelopes`.
   */
  key_envelope:
    | {kind: 'site_master_v1'; wrap_blob_b64: string}
    | {kind: 'per_device_v1'};
  /** Present only when `key_envelope.kind === 'per_device_v1'`. */
  device_envelopes?: Array<{
    device_id: string;
    /** Base64: `iv(12) || gcm_seal(data_key)` — sealed with that device's 32-byte key. */
    wrap_blob_b64: string;
  }>;
  /** Index for UX / validation; authoritative list is inner payload after decrypt. */
  workers_index: Array<{id: string; name: string}>;
  payload: {
    path: 'payload.bin';
    sha256: string;
    size_bytes: number;
  };
};

export type SitePackageInnerPayload = {
  inner_format_version: 1;
  site_id: string;
  workers: SitePackageInnerWorker[];
};

export type SitePackageInnerWorker = {
  id: string;
  name: string;
  role: string;
  site_id: string;
  language_preference: string;
  enrolled_at: string;
  revoked_at: string | null;
  reference_thumbnail_url: string | null;
  /** Postgres `bytea` as standard base64 (or null if not yet enrolled). */
  embedding_encrypted_base64: string | null;
  /** Optional inline thumbnail bytes (e.g. small JPEG) when URL fetch was not used. */
  reference_thumbnail_base64: string | null;
};

export type ParsedSitePackage =
  | {kind: 'v1_plain'; manifest: SitePackageManifestV1}
  | {
      kind: 'v2_encrypted';
      outer: SitePackageManifestV2Outer;
      files: Record<string, Uint8Array>;
    };

export function parseSitePackageManifest(json: unknown): SitePackageManifestV1 {
  if (!json || typeof json !== 'object') {
    throw new Error('manifest: expected object');
  }
  const o = json as Record<string, unknown>;
  if (o.version !== 1) {
    throw new Error('manifest: unsupported version');
  }
  if (typeof o.site_id !== 'string' || !Array.isArray(o.workers)) {
    throw new Error('manifest: missing site_id or workers');
  }
  const workers: SitePackageWorkerManifestV1[] = [];
  for (const w of o.workers) {
    if (!w || typeof w !== 'object') {
      continue;
    }
    const r = w as Record<string, unknown>;
    if (
      typeof r.id !== 'string' ||
      typeof r.name !== 'string' ||
      typeof r.role !== 'string' ||
      typeof r.site_id !== 'string'
    ) {
      throw new Error('manifest: invalid worker row');
    }
    const lang = r.language_preference === 'hi' ? 'hi' : 'en';
    workers.push({
      id: r.id,
      name: r.name,
      role: r.role,
      site_id: r.site_id,
      reference_thumbnail_url:
        typeof r.reference_thumbnail_url === 'string'
          ? r.reference_thumbnail_url
          : null,
      enrolled_at:
        typeof r.enrolled_at === 'string'
          ? r.enrolled_at
          : new Date().toISOString(),
      revoked_at: typeof r.revoked_at === 'string' ? r.revoked_at : null,
      language_preference: lang,
    });
  }
  return {
    version: 1,
    cipher: o.cipher === 'aes-256-gcm' ? 'aes-256-gcm' : 'none',
    generated_at:
      typeof o.generated_at === 'string'
        ? o.generated_at
        : new Date().toISOString(),
    site_id: o.site_id,
    workers,
  };
}

export function parseSitePackageManifestV2Outer(
  json: unknown,
): SitePackageManifestV2Outer {
  if (!json || typeof json !== 'object') {
    throw new Error('manifest: expected object');
  }
  const o = json as Record<string, unknown>;
  if (o.version !== 2) {
    throw new Error('manifest: expected version 2');
  }
  if (o.cipher !== 'aes-256-gcm') {
    throw new Error('manifest: v2 requires cipher aes-256-gcm');
  }
  if (typeof o.site_id !== 'string' || typeof o.generated_at !== 'string') {
    throw new Error('manifest: missing site_id or generated_at');
  }
  const ke = o.key_envelope;
  if (!ke || typeof ke !== 'object') {
    throw new Error('manifest: missing key_envelope');
  }
  const k = ke as Record<string, unknown>;
  // accept 'per_device_reserved' as legacy alias
  const keKind = k.kind === 'per_device_reserved' ? 'per_device_v1' : k.kind;
  if (keKind !== 'site_master_v1' && keKind !== 'per_device_v1') {
    throw new Error('manifest: unsupported key_envelope.kind');
  }
  if (keKind === 'site_master_v1' && typeof k.wrap_blob_b64 !== 'string') {
    throw new Error('manifest: site_master_v1 requires wrap_blob_b64');
  }
  const payload = o.payload;
  if (!payload || typeof payload !== 'object') {
    throw new Error('manifest: missing payload');
  }
  const p = payload as Record<string, unknown>;
  if (
    p.path !== 'payload.bin' ||
    typeof p.sha256 !== 'string' ||
    typeof p.size_bytes !== 'number'
  ) {
    throw new Error('manifest: invalid payload descriptor');
  }
  const fmt = o.package_format === 'incremental' ? 'incremental' : 'full';
  const workers_index = Array.isArray(o.workers_index) ? o.workers_index : [];
  const idx: Array<{id: string; name: string}> = [];
  for (const row of workers_index) {
    if (!row || typeof row !== 'object') {
      continue;
    }
    const r = row as Record<string, unknown>;
    if (typeof r.id === 'string' && typeof r.name === 'string') {
      idx.push({id: r.id, name: r.name});
    }
  }
  return {
    version: 2,
    cipher: 'aes-256-gcm',
    generated_at: o.generated_at,
    site_id: o.site_id,
    package_version:
      typeof o.package_version === 'number' ? o.package_version : 0,
    package_format: fmt,
    previous_package_version:
      typeof o.previous_package_version === 'number'
        ? o.previous_package_version
        : null,
    key_envelope:
      keKind === 'per_device_v1'
        ? {kind: 'per_device_v1' as const}
        : {
            kind: 'site_master_v1' as const,
            wrap_blob_b64: k.wrap_blob_b64 as string,
          },
    device_envelopes: (() => {
      if (keKind !== 'per_device_v1' || !Array.isArray(o.device_envelopes)) {
        return undefined;
      }
      const envelopes: Array<{device_id: string; wrap_blob_b64: string}> = [];
      for (const e of o.device_envelopes) {
        if (!e || typeof e !== 'object') {
          continue;
        }
        const ev = e as Record<string, unknown>;
        if (
          typeof ev.device_id === 'string' &&
          typeof ev.wrap_blob_b64 === 'string'
        ) {
          envelopes.push({
            device_id: ev.device_id,
            wrap_blob_b64: ev.wrap_blob_b64,
          });
        }
      }
      return envelopes;
    })(),
    workers_index: idx,
    payload: {
      path: 'payload.bin',
      sha256: p.sha256,
      size_bytes: p.size_bytes,
    },
  };
}

export function parseSitePackageInnerPayload(
  json: unknown,
): SitePackageInnerPayload {
  if (!json || typeof json !== 'object') {
    throw new Error('inner: expected object');
  }
  const o = json as Record<string, unknown>;
  if (o.inner_format_version !== 1) {
    throw new Error('inner: unsupported inner_format_version');
  }
  if (typeof o.site_id !== 'string' || !Array.isArray(o.workers)) {
    throw new Error('inner: missing site_id or workers');
  }
  const workers: SitePackageInnerWorker[] = [];
  for (const w of o.workers) {
    if (!w || typeof w !== 'object') {
      continue;
    }
    const r = w as Record<string, unknown>;
    if (
      typeof r.id !== 'string' ||
      typeof r.name !== 'string' ||
      typeof r.role !== 'string' ||
      typeof r.site_id !== 'string'
    ) {
      throw new Error('inner: invalid worker');
    }
    workers.push({
      id: r.id,
      name: r.name,
      role: r.role,
      site_id: r.site_id,
      language_preference:
        typeof r.language_preference === 'string'
          ? r.language_preference
          : 'en',
      enrolled_at:
        typeof r.enrolled_at === 'string'
          ? r.enrolled_at
          : new Date().toISOString(),
      revoked_at: typeof r.revoked_at === 'string' ? r.revoked_at : null,
      reference_thumbnail_url:
        typeof r.reference_thumbnail_url === 'string'
          ? r.reference_thumbnail_url
          : null,
      embedding_encrypted_base64:
        typeof r.embedding_encrypted_base64 === 'string'
          ? r.embedding_encrypted_base64
          : null,
      reference_thumbnail_base64:
        typeof r.reference_thumbnail_base64 === 'string'
          ? r.reference_thumbnail_base64
          : null,
    });
  }
  return {inner_format_version: 1, site_id: o.site_id, workers};
}
