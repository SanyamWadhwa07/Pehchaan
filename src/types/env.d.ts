/**
 * Legacy Node process.env typings (scripts / tooling).
 * App runtime config: `src/config/env.ts` via react-native-config + root `.env`.
 * Keys must match `.env.example` — never commit `.env`.
 */
declare namespace NodeJS {
  interface ProcessEnv {
    INTEGRATION_API_KEY?: string;
    INTEGRATION_ENDPOINT?: string;
    SUPABASE_URL?: string;
    SUPABASE_ANON_KEY?: string;
    SITE_PACKAGE_MASTER_KEY?: string;
    ATTENDANCE_PURGE_AFTER_INTEGRATION?: string;
  }
}

declare const process: {
  env: NodeJS.ProcessEnv;
};
