import type { ModelSelection, UserSettings } from "@/lib/schemas";
import type { ExternalModelAdmission } from "./external_model_admission";
import type { AutoModelCandidates } from "./auto_model_candidates";

/**
 * 内网 / 离线版本：不再做 Dyad 订阅与外部模型计费预检。
 *
 * 模型解析直接使用调用方给定的标识，不访问 api.dyad.sh / engine.dyad.sh，
 * 也不需要任何云端凭据。
 */
export async function preflightSubscriptionTurn(
  model: ModelSelection,
  _settings: UserSettings,
  signal: AbortSignal,
  _autoModelCandidates?: AutoModelCandidates,
): Promise<{
  model: ModelSelection;
  externalModelAdmission?: ExternalModelAdmission;
}> {
  signal.throwIfAborted();
  const { connection: _legacyConnection, ...identity } = model;
  return { model: identity };
}
