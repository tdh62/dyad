import { createTypedHandler } from "./base";
import { freeModelQuotaContracts } from "../types/free_model_quota";
import { DyadError, DyadErrorKind } from "@/errors/dyad_error";

export function registerFreeModelQuotaHandlers() {
  createTypedHandler(
    freeModelQuotaContracts.getFreeModelQuotaStatus,
    async () => getFreeModelQuotaStatus(),
  );
}

/**
 * 内网 / 离线版本：不再查询 `engine.dyad.sh/v1/free/quota`。
 *
 * Dyad Free 模型本身已从本版本移除，因此这里直接返回不可用错误，
 * 不产生任何网络请求。
 */
export async function getFreeModelQuotaStatus(): Promise<never> {
  throw new DyadError(
    "Dyad Free model quota is not available in this offline build.",
    DyadErrorKind.External,
  );
}
