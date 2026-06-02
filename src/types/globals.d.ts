/**
 * React Native / Hermes often omit DOM lib typings; site package crypto uses base64 helpers.
 * Do not use for web-only APIs beyond atob/btoa.
 */
declare function atob(data: string): string;
declare function btoa(data: string): string;
