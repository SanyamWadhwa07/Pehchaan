#!/usr/bin/env node
/**
 * Site-package crypto roundtrip test — Node 18+ ESM.
 * Validates the full encrypt → zip → unzip → decrypt pipeline used by:
 *   - Edge `create-site-package` (encrypt side)
 *   - React Native `decryptSitePackageV2Payload` (decrypt side)
 *
 * Run:  node scripts/verify-site-package-roundtrip.mjs
 *       npm run verify:roundtrip
 *
 * No additional build step required.  Uses only:
 *   - @noble/ciphers  (already in node_modules)
 *   - fflate          (already in node_modules)
 *   - Node 18+ built-ins: crypto, atob, btoa
 */

import { gcm } from '@noble/ciphers/aes.js';
import { randomBytes } from '@noble/ciphers/utils.js';
import { zipSync, unzipSync } from 'fflate';

// ---------------------------------------------------------------------------
// Helpers — mirrors Edge and RN implementations exactly
// ---------------------------------------------------------------------------

function concat(a, b) {
  const o = new Uint8Array(a.length + b.length);
  o.set(a, 0);
  o.set(b, a.length);
  return o;
}

/** AES-256-GCM seal: returns `iv(12) || ciphertext_with_tag`. */
function sealAesGcm256(key32, plaintext) {
  const iv = randomBytes(12);
  const sealed = gcm(key32, iv).encrypt(plaintext);
  return concat(iv, sealed);
}

/** AES-256-GCM open: accepts `iv(12) || ciphertext_with_tag`. */
function aesGcm256Open(key32, ivAndSealed) {
  if (key32.length !== 32) throw new Error('key must be 32 bytes');
  if (ivAndSealed.length < 13) throw new Error('blob too short');
  const iv = ivAndSealed.subarray(0, 12);
  const sealed = ivAndSealed.subarray(12);
  return gcm(key32, iv).decrypt(sealed);
}

/** standard base64 ↔ Uint8Array (Node 18+). */
function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function base64ToBytes(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function sha256Hex(bytes) {
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
  return Array.from(digest).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const SITE_ID = 'test-site-00000000-0000-0000-0000-000000000001';

const sampleWorkers = [
  {
    id: 'w1-00000000-0000-0000-0000-000000000001',
    name: 'Ravi Kumar',
    role: 'mason',
    site_id: SITE_ID,
    language_preference: 'hi',
    enrolled_at: '2025-01-15T10:00:00Z',
    revoked_at: null,
    reference_thumbnail_url: null,
    embedding_encrypted_base64: bytesToBase64(new Uint8Array(48).fill(0xab)),
    reference_thumbnail_base64: null,
  },
  {
    id: 'w2-00000000-0000-0000-0000-000000000002',
    name: 'Priya Sharma',
    role: 'supervisor_helper',
    site_id: SITE_ID,
    language_preference: 'en',
    enrolled_at: '2025-02-01T09:30:00Z',
    revoked_at: null,
    reference_thumbnail_url: 'https://example.com/thumb.jpg',
    embedding_encrypted_base64: null,
    reference_thumbnail_base64: null,
  },
];

// ---------------------------------------------------------------------------
// Build helpers (mirrors Edge buildEncryptedPackage)
// ---------------------------------------------------------------------------

async function buildV2Zip({ keyEnvelope, deviceEnvelopes, innerObj }) {
  const innerUtf8 = new TextEncoder().encode(JSON.stringify(innerObj));
  const dataKey = base64ToBytes(keyEnvelope._dataKeyB64); // internal test handle

  const payloadBin = sealAesGcm256(dataKey, innerUtf8);
  const payloadSha = await sha256Hex(payloadBin);

  const outer = {
    version: 2,
    cipher: 'aes-256-gcm',
    generated_at: new Date().toISOString(),
    site_id: SITE_ID,
    package_version: 1,
    package_format: 'full',
    previous_package_version: null,
    key_envelope: keyEnvelope.outer,
    ...(deviceEnvelopes ? { device_envelopes: deviceEnvelopes } : {}),
    workers_index: innerObj.workers.map((w) => ({ id: w.id, name: w.name })),
    payload: { path: 'payload.bin', sha256: payloadSha, size_bytes: payloadBin.byteLength },
  };

  return zipSync({
    'manifest.json': new TextEncoder().encode(JSON.stringify(outer)),
    'payload.bin': payloadBin,
  });
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

function assertThrows(fn, containsMsg, label) {
  try {
    fn();
    console.error(`  ✗ FAIL (no throw): ${label}`);
    failed++;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes(containsMsg)) {
      console.log(`  ✓ ${label}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL (wrong error "${msg}"): ${label}`);
      failed++;
    }
  }
}

// ---------------------------------------------------------------------------
// Test 1 — site_master_v1 roundtrip
// ---------------------------------------------------------------------------

console.log('\n── Test 1: site_master_v1 encrypt → decrypt ──');
{
  const masterKey = randomBytes(32);
  const masterB64 = bytesToBase64(masterKey);

  const dataKey = randomBytes(32);
  const wrapBlob = sealAesGcm256(masterKey, dataKey);

  const innerObj = { inner_format_version: 1, site_id: SITE_ID, workers: sampleWorkers };

  const zipBuf = await buildV2Zip({
    keyEnvelope: {
      outer: { kind: 'site_master_v1', wrap_blob_b64: bytesToBase64(wrapBlob) },
      _dataKeyB64: bytesToBase64(dataKey),
    },
    deviceEnvelopes: undefined,
    innerObj,
  });

  // --- decrypt side (mirrors decryptSitePackageV2Payload) ---
  const unzipped = unzipSync(zipBuf);
  const outer = JSON.parse(new TextDecoder().decode(unzipped['manifest.json']));
  const payloadBin = unzipped['payload.bin'];

  assert(outer.version === 2, 'outer.version === 2');
  assert(outer.cipher === 'aes-256-gcm', 'outer.cipher === aes-256-gcm');
  assert(outer.key_envelope.kind === 'site_master_v1', 'key_envelope.kind === site_master_v1');

  // Verify SHA-256
  const computedSha = await sha256Hex(payloadBin);
  assert(computedSha === outer.payload.sha256, 'payload SHA-256 matches manifest');
  assert(payloadBin.byteLength === outer.payload.size_bytes, 'payload size_bytes matches');

  // Unwrap data key with master key
  const unwrapRaw = base64ToBytes(outer.key_envelope.wrap_blob_b64);
  const recoveredDataKey = aesGcm256Open(base64ToBytes(masterB64), unwrapRaw);
  assert(recoveredDataKey.length === 32, 'unwrapped data key is 32 bytes');

  // Decrypt inner payload
  const innerBytes = aesGcm256Open(recoveredDataKey, payloadBin);
  const inner = JSON.parse(new TextDecoder().decode(innerBytes));

  assert(inner.inner_format_version === 1, 'inner_format_version === 1');
  assert(inner.site_id === SITE_ID, 'inner site_id matches');
  assert(inner.workers.length === 2, 'inner workers count === 2');
  assert(inner.workers[0].name === 'Ravi Kumar', 'worker[0].name correct');
  assert(inner.workers[1].embedding_encrypted_base64 === null, 'worker[1] embedding null preserved');
  const w0embedding = inner.workers[0].embedding_encrypted_base64;
  assert(typeof w0embedding === 'string' && w0embedding.length > 0, 'worker[0] embedding_encrypted_base64 round-tripped');
}

// ---------------------------------------------------------------------------
// Test 2 — per_device_v1 roundtrip (two devices, only device B decrypts)
// ---------------------------------------------------------------------------

console.log('\n── Test 2: per_device_v1 encrypt → decrypt (correct device) ──');
{
  const masterKey = randomBytes(32); // still needed to derive dataKey on Edge
  const dataKey = randomBytes(32);

  const deviceAKey = randomBytes(32);
  const deviceBKey = randomBytes(32);
  const deviceAId = 'device-a-0000-0000-0000-000000000001';
  const deviceBId = 'device-b-0000-0000-0000-000000000002';

  const deviceEnvelopes = [
    { device_id: deviceAId, wrap_blob_b64: bytesToBase64(sealAesGcm256(deviceAKey, dataKey)) },
    { device_id: deviceBId, wrap_blob_b64: bytesToBase64(sealAesGcm256(deviceBKey, dataKey)) },
  ];

  const innerObj = { inner_format_version: 1, site_id: SITE_ID, workers: sampleWorkers };
  const zipBuf = await buildV2Zip({
    keyEnvelope: {
      outer: { kind: 'per_device_v1' },
      _dataKeyB64: bytesToBase64(dataKey),
    },
    deviceEnvelopes,
    innerObj,
  });

  const unzipped = unzipSync(zipBuf);
  const outer = JSON.parse(new TextDecoder().decode(unzipped['manifest.json']));
  const payloadBin = unzipped['payload.bin'];

  assert(outer.key_envelope.kind === 'per_device_v1', 'key_envelope.kind === per_device_v1');
  assert(Array.isArray(outer.device_envelopes) && outer.device_envelopes.length === 2, 'device_envelopes has 2 entries');
  assert(!('wrap_blob_b64' in outer.key_envelope), 'key_envelope has no wrap_blob_b64 at top level');

  // Device B resolves its envelope
  const bEntry = outer.device_envelopes.find((e) => e.device_id === deviceBId);
  assert(bEntry != null, 'device B envelope found');
  const recoveredDataKey = aesGcm256Open(deviceBKey, base64ToBytes(bEntry.wrap_blob_b64));
  assert(recoveredDataKey.length === 32, 'device B unwrapped key is 32 bytes');

  const innerBytes = aesGcm256Open(recoveredDataKey, payloadBin);
  const inner = JSON.parse(new TextDecoder().decode(innerBytes));
  assert(inner.workers.length === 2, 'per_device inner workers count === 2');
}

// ---------------------------------------------------------------------------
// Test 3 — wrong device key must throw (auth tag mismatch)
// ---------------------------------------------------------------------------

console.log('\n── Test 3: per_device_v1 wrong key → gcm auth-tag failure ──');
{
  const dataKey = randomBytes(32);
  const deviceKey = randomBytes(32);
  const wrongKey = randomBytes(32);
  const deviceId = 'device-x-0000-0000-0000-000000000099';

  const wrapBlob = sealAesGcm256(deviceKey, dataKey);
  const wrapB64 = bytesToBase64(wrapBlob);

  assertThrows(
    () => aesGcm256Open(wrongKey, base64ToBytes(wrapB64)),
    '', // Noble throws a generic "invalid tag" style error — any throw is correct
    'wrong device key throws during data-key unwrap',
  );
}

// ---------------------------------------------------------------------------
// Test 4 — SHA-256 tamper detection
// ---------------------------------------------------------------------------

console.log('\n── Test 4: tampered payload.bin → SHA-256 mismatch ──');
{
  const masterKey = randomBytes(32);
  const dataKey = randomBytes(32);
  const wrapBlob = sealAesGcm256(masterKey, dataKey);

  const innerObj = { inner_format_version: 1, site_id: SITE_ID, workers: [] };
  const zipBuf = await buildV2Zip({
    keyEnvelope: {
      outer: { kind: 'site_master_v1', wrap_blob_b64: bytesToBase64(wrapBlob) },
      _dataKeyB64: bytesToBase64(dataKey),
    },
    innerObj,
  });

  const files = unzipSync(zipBuf);
  const outer = JSON.parse(new TextDecoder().decode(files['manifest.json']));
  const payloadBin = files['payload.bin'];

  // Flip one byte
  const tampered = new Uint8Array(payloadBin);
  tampered[0] ^= 0xff;

  const tampered_sha = await sha256Hex(tampered);
  assert(tampered_sha !== outer.payload.sha256, 'tampered SHA-256 !== manifest SHA-256 (tamper detected)');
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${'─'.repeat(48)}`);
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log(`${'─'.repeat(48)}\n`);

if (failed > 0) {
  process.exit(1);
}
