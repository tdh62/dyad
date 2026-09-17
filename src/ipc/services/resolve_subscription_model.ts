import type { ModelSelection, UserSettings } from "@/lib/schemas";

/**
 * 内网 / 离线版本：不把任何模型路由到 Dyad Pro 或 ChatGPT 订阅。
 *
 * 直接返回调用方给定的模型标识（provider + name），并且**不附加 connection**，
 * 因此 `getModelClient` 会为该模型使用其自身供应商的传输方式：
 * 本地模型（Ollama / LM Studio）、局域网兼容服务，或自带 API Key 的云供应商。
 */
export async function resolveSubscriptionModel(
  model: ModelSelection,
  _settings: UserSettings,
): Promise<ModelSelection> {
  const { connection: _legacyConnection, ...identity } = model;
  return identity;
}
