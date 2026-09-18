import { type ChatMode, type UserSettings } from "@/lib/schemas";
import {
  normalizeStoredChatMode,
  resolveChatMode,
  type ChatModeResolution,
} from "@/lib/chatMode";
import {
  FREE_PRO_BUILD_MODE_ERROR,
  getFreeProCompatibleChatMode,
  isFreeProBuildModeCombination,
} from "@/lib/freeProModel";
import { DyadError, DyadErrorKind } from "@/errors/dyad_error";
import { readSettings } from "@/main/settings";
import { getEnvVar } from "@/ipc/utils/read_env";
import { LOCAL_PROVIDERS } from "@/ipc/shared/language_model_constants";

export { normalizeStoredChatMode };

export function assertChatModeCompatibleWithModel(
  settings: UserSettings,
  chatMode: ChatMode,
): void {
  if (isFreeProBuildModeCombination(settings.selectedModel, chatMode)) {
    throw new DyadError(FREE_PRO_BUILD_MODE_ERROR, DyadErrorKind.Precondition);
  }
}

export async function resolveChatModeForTurn({
  storedChatMode,
  requestedChatMode,
  settings = readSettings(),
}: {
  storedChatMode: string | null | undefined;
  requestedChatMode?: ChatMode | null;
  settings?: UserSettings;
}): Promise<ChatModeResolution & { settings: UserSettings }> {
  const modeForTurn =
    requestedChatMode === undefined ? storedChatMode : requestedChatMode;
  const normalizedChatMode = normalizeStoredChatMode(modeForTurn);
  const envVars = getChatModeEnvVars();

  const resolution = resolveChatMode({
    storedChatMode: modeForTurn,
    settings,
    envVars,
  });

  return {
    ...resolution,
    mode:
      normalizedChatMode === null
        ? getFreeProCompatibleChatMode(settings.selectedModel, resolution.mode)
        : resolution.mode,
    settings,
  };
}

export async function getInitialChatModeForNewChat(
  initialChatMode?: ChatMode,
): Promise<ChatMode | null> {
  return initialChatMode ?? null;
}

function getChatModeEnvVars(): Record<string, string | undefined> {
  // 本版本没有内置云端渠道，也就没有对应的 provider 环境变量可探测；
  // 本地供应商由运行时发现，不需要凭据。
  void LOCAL_PROVIDERS;
  return {};
}
