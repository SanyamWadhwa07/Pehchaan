/**
 * React Native / Hermes often omit DOM lib typings; site package crypto uses base64 helpers.
 * Do not use for web-only APIs beyond atob/btoa.
 */
declare function atob(data: string): string;
declare function btoa(data: string): string;

declare module '@noble/ciphers/aes.js' {
  export function gcm(
    key: Uint8Array,
    iv: Uint8Array,
  ): {
    encrypt(plaintext: Uint8Array): Uint8Array;
    decrypt(ciphertext: Uint8Array): Uint8Array;
  };
}

declare module 'fflate' {
  export function unzipSync(
    data: Uint8Array,
    opts?: {filter?: () => boolean},
  ): Record<string, Uint8Array>;
  export function zipSync(files: Record<string, Uint8Array>): Uint8Array;
  export function strFromU8(data: Uint8Array, unicode?: boolean): string;
}
