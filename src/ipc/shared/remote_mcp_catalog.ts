import type { McpCatalogEntry } from "@/ipc/types/mcp_catalog";

const FAILURE_CACHE_TTL_MS = 30 * 1000;

type McpCatalogCacheEntry = {
  entries: McpCatalogEntry[];
  expiresAt: number;
};

let catalogCache: McpCatalogCacheEntry | null = null;

/**
 * 内网 / 离线版本：不再访问 `https://api.dyad.sh/v1/mcp-catalog`。
 *
 * 调用方把“无目录”视为正常状态，因此这里始终返回空列表。
 * 如需从局域网镜像获取，可在调用方接入自定义实现。
 */
export async function getRemoteMcpCatalog(): Promise<McpCatalogEntry[]> {
  if (catalogCache && catalogCache.expiresAt > Date.now()) {
    return catalogCache.entries;
  }

  catalogCache = {
    entries: [],
    expiresAt: Date.now() + FAILURE_CACHE_TTL_MS,
  };
  return [];
}

export function clearMcpCatalogCacheForTests() {
  catalogCache = null;
}
