import { z } from "zod";
import { DyadError, DyadErrorKind } from "@/errors/dyad_error";

export const UserInfoResponseSchema = z.object({
  usedCredits: z.number().finite().nonnegative(),
  totalCredits: z.number().finite().nonnegative(),
  budgetResetDate: z.string(),
  userId: z.string(),
  isTrial: z.boolean().optional().default(false),
});
export type UserInfoResponse = z.infer<typeof UserInfoResponseSchema>;
export class UserInfoApiError extends Error {
  constructor(readonly status: number) {
    super(`Account usage API returned HTTP ${status}`);
  }
}

/**
 * 内网 / 离线版本：不再访问 `https://api.dyad.sh/v1/user/info`。
 *
 * 调用方设计为容错：
 * - `checkSubscriptionCredits` 在查询失败时 fail-open（放行），不影响本地模型；
 * - `get-user-budget` 捕获异常后返回 null，UI 不会展示云端额度。
 */
export async function fetchUserInfo(
  _apiKey: string,
  _signal?: AbortSignal,
): Promise<UserInfoResponse> {
  throw new DyadError(
    "Account usage API is disabled in this offline build.",
    DyadErrorKind.External,
  );
}
