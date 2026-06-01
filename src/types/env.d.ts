/**
 * Env vars injected at build time (Metro / Babel).
 * Keys must match .env.example — never commit .env.
 */
declare namespace NodeJS {
  interface ProcessEnv {
    INTEGRATION_API_KEY?: string;
    INTEGRATION_ENDPOINT?: string;
    SUPABASE_URL?: string;
    SUPABASE_ANON_KEY?: string;
  }
}

declare const process: {
  env: NodeJS.ProcessEnv;
};
