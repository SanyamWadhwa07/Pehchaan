import { NativeModules, TurboModuleRegistry } from 'react-native';

type EnvMap = Record<string, string | undefined>;

function envFromNativeModule(mod: Record<string, unknown> | null | undefined): EnvMap {
  if (!mod || typeof mod !== 'object') {
    return {};
  }
  const out: EnvMap = {};
  for (const [key, value] of Object.entries(mod)) {
    if (key === 'getConstants' || typeof value !== 'string') {
      continue;
    }
    out[key] = value;
  }
  return out;
}

/**
 * Read `.env` values baked in at Android/iOS build time.
 * - react-native-config 1.5.x: `NativeModules.RNCConfigModule` constants (RN 0.73).
 * - react-native-config 1.6.x: TurboModule `getConfig().config` (newer RN).
 */
export function loadAppConfig(): EnvMap {
  // 1.5.x — constants on the native module (RN 0.73 + manual Android link).
  const legacyModule = NativeModules.RNCConfigModule as Record<string, unknown> | undefined;
  const fromLegacy = envFromNativeModule(legacyModule);
  if (Object.keys(fromLegacy).length > 0) {
    return fromLegacy;
  }

  try {
    const turbo = TurboModuleRegistry.get('RNCConfigModule') as {
      getConfig?: () => { config?: EnvMap };
    } | null;
    if (turbo?.getConfig) {
      const wrapped = turbo.getConfig();
      return wrapped?.config ?? {};
    }
  } catch {
    // TurboModule path unavailable.
  }

  const legacyGetConfig = legacyModule as {
    getConfig?: () => { config?: EnvMap } | EnvMap;
  } | null;
  if (legacyGetConfig?.getConfig) {
    const result = legacyGetConfig.getConfig();
    if (result && typeof result === 'object' && 'config' in result) {
      return (result as { config?: EnvMap }).config ?? {};
    }
    return envFromNativeModule(result as Record<string, unknown>);
  }

  if (__DEV__) {
    console.warn(
      '[config] RNCConfigModule not linked — run: cd android && ./gradlew clean && cd .. && npm run android',
    );
  }
  return {};
}
