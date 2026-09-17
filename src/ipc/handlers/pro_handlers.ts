import { shell } from "electron";
import log from "electron-log";
import { createLoggedHandler } from "./safe_handle";
import { createLoggedTypedHandler } from "./base";
import { systemContracts, UserBudgetInfo } from "@/ipc/types";
import { IS_TEST_BUILD } from "../utils/test_utils";
import { DyadError, DyadErrorKind } from "@/errors/dyad_error";

export {
  UserInfoResponseSchema,
  type UserInfoResponse,
} from "../services/user_budget_service";

const logger = log.scope("pro_handlers");
const handle = createLoggedHandler(logger);
const typedHandle = createLoggedTypedHandler(logger);

export function parseBillingActionUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new DyadError("Invalid billing action URL", DyadErrorKind.Validation);
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "academy.dyad.sh" ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== ""
  ) {
    throw new DyadError("Invalid billing action URL", DyadErrorKind.Validation);
  }
  return url.toString();
}

export function registerProHandlers() {
  // This method should try to avoid throwing errors because this is auxiliary
  // information and isn't critical to using the app
  handle("get-user-budget", async (): Promise<UserBudgetInfo | null> => {
    if (IS_TEST_BUILD) {
      // Return mock budget data for E2E tests instead of spamming the API
      const resetDate = new Date();
      resetDate.setDate(resetDate.getDate() + 30); // Reset in 30 days
      return {
        usedCredits: 100,
        totalCredits: 1000,
        budgetResetDate: resetDate,
        redactedUserId: "<redacted-user-id-testing>",
        isTrial: false,
      };
    }
    // 内网 / 离线版本：不再查询 Dyad 云端额度与试用状态。
    // 本版本没有云端账号，UI 一律按无额度展示。
    return null;
  });

  typedHandle(systemContracts.getSubscriptionStatus, async () => {
    // 内网 / 离线版本：不再查询 academy.dyad.sh 的订阅状态。
    return null;
  });

  typedHandle(systemContracts.openBillingAction, async (_event, value) => {
    const url = parseBillingActionUrl(value);
    if (IS_TEST_BUILD) {
      logger.debug("E2E test mode: skipped opening billing action URL", url);
      return;
    }
    await shell.openExternal(url);
  });
}
