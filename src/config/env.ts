/**
 * Typed access to app configuration / env vars.
 * Import from here — do not read Config or process.env in screens or services.
 *
 * Values come from root `.env` via react-native-config (Android/iOS build).
 */

import Config from 'react-native-config';

export const integrationEnv = {
  apiKey: Config.INTEGRATION_API_KEY ?? '',
  endpoint: Config.INTEGRATION_ENDPOINT ?? '',
} as const;

export const supabaseEnv = {
  url: Config.SUPABASE_URL ?? '',
  anonKey: Config.SUPABASE_ANON_KEY ?? '',
} as const;

export function isIntegrationConfigured(): boolean {
  return Boolean(integrationEnv.apiKey && integrationEnv.endpoint);
}
