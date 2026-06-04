declare module 'react-native-config' {
  export interface NativeConfig {
    SUPABASE_URL?: string;
    SUPABASE_ANON_KEY?: string;
    INTEGRATION_API_KEY?: string;
    INTEGRATION_ENDPOINT?: string;
    /** Base64 of 32 raw bytes — must match Edge secret `SITE_PACKAGE_MASTER_KEY` for v2 packages. */
    SITE_PACKAGE_MASTER_KEY?: string;
    /**
     * When `true`, local attendance stays `verified` until `integration_push_status` is `pushed` or `not_applicable` before `purged`.
     * When unset/false, local row moves to `purged` as soon as server `sync_status` is `verified`.
     */
    ATTENDANCE_PURGE_AFTER_INTEGRATION?: string;
  }

  const Config: NativeConfig;
  export default Config;
}
