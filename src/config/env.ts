/**
 * Typed access to app configuration / env vars.
 * Import from here — do not read process.env in screens or services.
 */

export const integrationEnv = {
  apiKey: process.env.INTEGRATION_API_KEY ?? '',
  endpoint: process.env.INTEGRATION_ENDPOINT ?? '',
} as const;

export const supabaseEnv = {
  url: process.env.SUPABASE_URL ?? '',
  anonKey: process.env.SUPABASE_ANON_KEY ?? '',
} as const;

export function isIntegrationConfigured(): boolean {
  return Boolean(integrationEnv.apiKey && integrationEnv.endpoint);
}
