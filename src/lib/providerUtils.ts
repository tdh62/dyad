import { type UserSettings } from "./schemas";

export interface ProviderCheckOptions {
  settings: UserSettings | null;
  envVars: Record<string, string | undefined>;
  /** Provider data from the query (needed for custom providers and env var lookup) */
  providerData?: { id: string; envVarName?: string }[];
  /** If true, returns false while data is still loading */
  isLoading?: boolean;
}

/**
 * Checks if a specific provider is set up with valid credentials.
 *
 * 内网 / 离线版本：只剩本地供应商（无需凭据，运行时自动发现）与用户自定义
 * 供应商（可选用环境变量提供 key），因此这里不再有内置云端渠道的分支。
 */
export function isProviderSetup(
  provider: string,
  options: ProviderCheckOptions,
): boolean {
  const { settings, envVars, providerData, isLoading } = options;

  if (isLoading) {
    return false;
  }

  // Check API key in settings
  if (settings?.providerSettings[provider]?.apiKey?.value) {
    return true;
  }

  // Check provider data for env var name (custom providers)
  const providerInfo = providerData?.find((p) => p.id === provider);
  if (providerInfo?.envVarName && envVars[providerInfo.envVarName]) {
    return true;
  }

  return false;
}

/**
 * Checks whether any provider is set up with credentials.
 */
export function isNonGoogleProviderSetup(
  settings: UserSettings,
  envVars: Record<string, string | undefined>,
): boolean {
  if (!settings) return false;

  const options: ProviderCheckOptions = { settings, envVars };
  const configuredProviders = new Set([
    ...Object.keys(settings.providerSettings ?? {}),
  ]);

  return [...configuredProviders].some((provider) =>
    isProviderSetup(provider, options),
  );
}
