/**
 * UUID v4 for idempotency keys (no extra dependency).
 * Prefer `crypto.getRandomValues` when available (Hermes / modern RN).
 */
export function randomUuidV4(): string {
  const bytes = new Uint8Array(16);
  type G = typeof globalThis & { crypto?: { getRandomValues?: (arr: Uint8Array) => void } };
  const g = globalThis as G;
  if (typeof g.crypto?.getRandomValues === 'function') {
    g.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
