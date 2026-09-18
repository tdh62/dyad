import { getSubscriptionAccount } from "../services/codex_subscription_account";
import { createTypedHandler } from "./base";
import { settingsContracts } from "../types/settings";
import { writeSettings, readEffectiveSettings } from "../../main/settings";
import {
  connectCodexSubscription,
  disconnectCodexSubscription,
  acknowledgeSubscriptionConnection,
} from "../services/codex_subscription_auth";

export function registerSettingsHandlers() {
  createTypedHandler(
    settingsContracts.acknowledgeSubscriptionConnection,
    async () => acknowledgeSubscriptionConnection(),
  );
  createTypedHandler(settingsContracts.getCodexSubscriptionStatus, async () =>
    getSubscriptionAccount(),
  );
  createTypedHandler(
    settingsContracts.connectCodexSubscription,
    async (_, options) =>
      connectCodexSubscription({ selectModel: options.selectModel }),
  );
  createTypedHandler(settingsContracts.disconnectCodexSubscription, async () =>
    disconnectCodexSubscription(),
  );
  // Note: Settings handlers intentionally use createTypedHandler without logging
  // to avoid logging sensitive data (API keys, tokens, etc.) from args/return values.

  createTypedHandler(settingsContracts.getUserSettings, async () => {
    return readEffectiveSettings();
  });

  createTypedHandler(settingsContracts.setUserSettings, async (_, settings) => {
    writeSettings(settings);
    return readEffectiveSettings();
  });
}
