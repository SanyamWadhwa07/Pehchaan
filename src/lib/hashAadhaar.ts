import {sha256} from 'js-sha256';

/**
 * SHA-256 hash of ID / Aadhaar number. Raw value must never be stored or logged.
 */
export function hashIdNumber(idNumber: string): string {
  const normalized = idNumber.trim();
  return sha256(normalized);
}
