const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

export type RemoteDesktopConfig = {
  version?: string;
  expiresAt?: string;
  defaults?: {
    blockUnsafeNpmPackages?: boolean;
  };
};

type RemoteDesktopConfigCacheEntry = {
  config: RemoteDesktopConfig | null;
  expiresAt: number;
};

let remoteDesktopConfigCache: RemoteDesktopConfigCacheEntry | null = null;

/**
 * 内网 / 离线版本：不再访问 `https://api.dyad.sh/v1/desktop-config`。
 *
 * 始终返回 null，调用方会回退到内置默认行为。
 */
export async function getRemoteDesktopConfig(): Promise<RemoteDesktopConfig | null> {
  if (
    remoteDesktopConfigCache &&
    remoteDesktopConfigCache.expiresAt > Date.now()
  ) {
    return remoteDesktopConfigCache.config;
  }

  remoteDesktopConfigCache = {
    config: null,
    expiresAt: Date.now() + DEFAULT_CACHE_TTL_MS,
  };
  return null;
}
