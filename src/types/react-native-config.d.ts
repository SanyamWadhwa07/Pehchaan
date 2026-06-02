declare module 'react-native-config' {
  export interface NativeConfig {
    SUPABASE_URL?: string;
    SUPABASE_ANON_KEY?: string;
    INTEGRATION_API_KEY?: string;
    INTEGRATION_ENDPOINT?: string;
  }

  const Config: NativeConfig;
  export default Config;
}
