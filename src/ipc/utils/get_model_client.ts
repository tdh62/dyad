import type { ExternalModelAdmission } from "../services/external_model_admission";
import type { AutoModelCandidates } from "../services/auto_model_candidates";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI as createGoogle } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { FetchFunction } from "@ai-sdk/provider-utils";
import type {
  LargeLanguageModel,
  ModelSelection,
  UserSettings,
} from "../../lib/schemas";
import { getEnvVar } from "./read_env";
import log from "electron-log";
import { getLanguageModelProviders } from "../shared/language_model_helpers";
import { LanguageModelProvider } from "@/ipc/types";
import { getLmStudioBaseUrl } from "./lm_studio_utils";
import { createOllamaProvider } from "./ollama_provider";
import { getOllamaApiUrl } from "../handlers/local_model_ollama_handler";
import { getTestFetchOption } from "./test_fetch_override";
import { DyadError, DyadErrorKind } from "@/errors/dyad_error";
import {
  findInvalidProviderApiKeyCharacter,
  formatInvalidProviderApiKeyMessage,
  normalizeProviderApiKeyInput,
} from "@/lib/providerApiKey";
import { resolveModelSelection } from "./model_effort";
import { getModelPreferenceKey } from "@/lib/modelEffort";
import { getAutoSidekickRuntimeModel } from "@/lib/autoSidekick";
import { createCodexSubscriptionModel } from "./codex_subscription_provider";
import { resolveSubscriptionModel } from "../services/resolve_subscription_model";
import { shouldBillChatGPTSubscription } from "../services/subscription_billing";
import { resolveApiProtocol, type ApiProtocol } from "../shared/api_protocol";

// The test-only fetch seam lives in ./test_fetch_override (dependency-free,
// so secondary factories can use it without import cycles). Re-exported here
// for existing importers.
export { setModelClientFetchForTesting } from "./test_fetch_override";

function getModelClientFetchOption(): { fetch?: FetchFunction } {
  return getTestFetchOption();
}

export interface ModelClient {
  model: LanguageModel;
  builtinProviderId?: string;
  reasoningEffortProviderId?: string;
  /**
   * 该 client 实际使用的线上协议，供消息规范化（OpenAI Responses 的
   * call_id 长度限制、itemId 清理）判断使用。
   *
   * 之所以随 client 传递而不在消息层查询：`local_agent_handler` 的
   * 规范化判断处于同步路径，无法 await provider 配置查询。
   * 未设置表示内置 provider，此时按 provider 名判定。
   */
  apiProtocol?: ApiProtocol;
  /** Actual source, including the active candidate of an Auto fallback chain. */
  getRuntimeModel?: () => ModelSelection;
}

// Callers supply the accepted turn's settings (or an auxiliary-call snapshot).
function subscriptionBillingKey(settings: UserSettings): string | null {
  return shouldBillChatGPTSubscription(settings)
    ? (settings.providerSettings?.auto?.apiKey?.value ?? null)
    : null;
}

export interface ModelClientResult {
  modelClient: ModelClient;
  runtimeModel: LargeLanguageModel;
  isEngineEnabled?: boolean;
  isSmartContextEnabled?: boolean;
}

const logger = log.scope("getModelClient");
export async function getModelClient(
  selectedModel: LargeLanguageModel,
  settings: UserSettings,
  modelSelectionOverride?: ModelSelection,
  context?: {
    chatId: number;
    autoModelCandidates?: AutoModelCandidates;
    externalModelAdmission?: ExternalModelAdmission;
  },
  // files?: File[],
): Promise<ModelClientResult> {
  const selectedModelSelection =
    modelSelectionOverride ??
    (await resolveModelSelection({
      model: selectedModel,
      preferredEffortLevel:
        settings.modelEffortPreferences?.[getModelPreferenceKey(selectedModel)],
    }));
  const model = getAutoSidekickRuntimeModel(selectedModel);
  if (selectedModelSelection.connection === "pro" && !settings.enableDyadPro)
    throw new DyadError(
      "Enable Dyad Pro before using Pro credits.",
      DyadErrorKind.Auth,
    );
  // A supplied connection is the source already accepted for this turn.
  // Auxiliary callers without one resolve their own concrete model here.
  const modelSelection = getAutoSidekickRuntimeModel(
    modelSelectionOverride?.connection
      ? selectedModelSelection
      : await resolveSubscriptionModel(selectedModelSelection, settings),
  );
  const connection = modelSelection.connection;
  if (connection === "subscription") {
    if (modelSelection.provider !== "openai")
      throw new DyadError(
        "Subscription supports OpenAI models only. Choose a ChatGPT model.",
        DyadErrorKind.Validation,
      );
    return {
      modelClient: {
        model: await createCodexSubscriptionModel(
          modelSelection.name,
          subscriptionBillingKey(settings),
          context,
          settings.chatgptFastMode,
        ),
        builtinProviderId: "openai",
        getRuntimeModel: () => modelSelection,
      },
      runtimeModel: modelSelection,
      isEngineEnabled: false,
    };
  }
  const allProviders = await getLanguageModelProviders();

  // --- Handle specific provider ---
  const providerConfig = allProviders.find((p) => p.id === model.provider);

  if (!providerConfig) {
    throw new DyadError(
      `Configuration not found for provider: ${model.provider}`,
      DyadErrorKind.NotFound,
    );
  }

  // 内网 / 离线版本：不再路由到 Dyad Engine，也不再有 auto / free-pro 这类
  // Dyad 云端模型。所有模型一律直连其自身供应商端点（本地模型、局域网
  // API 或自带 API Key 的云供应商）。
  if (model.provider === "auto") {
    throw new DyadError(
      "Dyad cloud models are not available in this build. Choose a local model or an API-key provider.",
      DyadErrorKind.Validation,
    );
  }

  const regular = getRegularModelClient(model, settings, providerConfig);
  return {
    ...regular,
    runtimeModel: model,
  };
}

/**
 * 自定义 Provider 的客户端构造：按 provider 声明的线上协议选用官方 SDK。
 *
 * 认证与请求形状完全交给各 SDK 处理（OpenAI 系用 Authorization、
 * Anthropic 用 x-api-key + anthropic-version、Gemini 用 x-goog-api-key），
 * 因此自建端点只需提供协议兼容的 base URL。
 *
 * 未声明协议时按 `chat-completions` 处理，与改造前的行为完全一致。
 */
function getCustomProviderModelClient({
  model,
  providerConfig,
  apiKey,
  includeUsage,
}: {
  model: LargeLanguageModel;
  providerConfig: LanguageModelProvider;
  apiKey: string | undefined;
  includeUsage: boolean;
}): {
  modelClient: ModelClient;
  backupModelClients: ModelClient[];
} {
  const baseURL = providerConfig.apiBaseUrl!;
  const apiProtocol = resolveApiProtocol(providerConfig.apiProtocol);
  const fetchOption = getModelClientFetchOption();

  switch (apiProtocol) {
    case "responses": {
      const provider = createOpenAI({ apiKey, baseURL, ...fetchOption });
      return {
        modelClient: {
          model: provider.responses(model.name),
          builtinProviderId: providerConfig.id,
          apiProtocol,
        },
        backupModelClients: [],
      };
    }
    case "messages": {
      const provider = createAnthropic({ apiKey, baseURL, ...fetchOption });
      return {
        modelClient: {
          model: provider(model.name),
          builtinProviderId: providerConfig.id,
          apiProtocol,
        },
        backupModelClients: [],
      };
    }
    case "gemini": {
      const provider = createGoogle({ apiKey, baseURL, ...fetchOption });
      return {
        modelClient: {
          model: provider(model.name),
          builtinProviderId: providerConfig.id,
          apiProtocol,
        },
        backupModelClients: [],
      };
    }
    default: {
      // chat-completions（含未声明协议的历史数据）
      const provider = createOpenAICompatible({
        name: providerConfig.id,
        includeUsage,
        baseURL,
        apiKey,
        ...fetchOption,
      });
      return {
        modelClient: {
          model: provider(model.name),
          builtinProviderId: providerConfig.id,
          // OpenAI 兼容 SDK 以 provider 名作为 providerOptions 的键。
          reasoningEffortProviderId: providerConfig.id,
          apiProtocol: "chat-completions",
        },
        backupModelClients: [],
      };
    }
  }
}

function getRegularModelClient(
  model: LargeLanguageModel,
  settings: UserSettings,
  providerConfig: LanguageModelProvider,
  includeUsage = false,
): {
  modelClient: ModelClient;
  backupModelClients: ModelClient[];
} {
  const providerId = providerConfig.id;
  // 内网 / 离线版本：只剩本地供应商（无需凭据）与用户自定义供应商
  // （可选地用环境变量提供 key），因此不再有 Azure 等特例分支。
  const apiKey = getProviderApiKeyForRequest(
    settings.providerSettings?.[model.provider]?.apiKey?.value ||
      (providerConfig.envVarName
        ? getEnvVar(providerConfig.envVarName)
        : undefined),
    providerConfig.name ?? providerConfig.id,
  );
  // Create client based on provider ID or type
  switch (providerId) {
    case "ollama": {
      const provider = createOllamaProvider({
        baseURL: getOllamaApiUrl(),
        includeUsage,
        ...getModelClientFetchOption(),
      });
      return {
        modelClient: {
          model: provider(model.name),
          builtinProviderId: providerId,
          reasoningEffortProviderId: "ollama",
        },
        backupModelClients: [],
      };
    }
    case "lmstudio": {
      // LM Studio uses OpenAI compatible API
      const baseURL = providerConfig.apiBaseUrl || getLmStudioBaseUrl() + "/v1";
      const provider = createOpenAICompatible({
        name: "lmstudio",
        includeUsage,
        baseURL,
        ...getModelClientFetchOption(),
      });
      return {
        modelClient: {
          model: provider(model.name),
          builtinProviderId: providerId,
          reasoningEffortProviderId: "lmstudio",
        },
        backupModelClients: [],
      };
    }
    default: {
      // Handle custom providers
      if (providerConfig.type === "custom") {
        if (!providerConfig.apiBaseUrl) {
          throw new Error(
            `Custom provider ${model.provider} is missing the API Base URL.`,
          );
        }
        return getCustomProviderModelClient({
          model,
          providerConfig,
          apiKey,
          includeUsage,
        });
      }
      // If it's not a known ID and not type 'custom', it's unsupported
      throw new DyadError(
        `Unsupported model provider: ${model.provider}`,
        DyadErrorKind.Validation,
      );
    }
  }
}

function getProviderApiKeyForRequest(
  value: string | null | undefined,
  providerDisplayName: string,
): string | undefined {
  const normalizedValue = normalizeProviderApiKeyInput(value);
  if (!normalizedValue) {
    return undefined;
  }
  const invalidCharacter = findInvalidProviderApiKeyCharacter(normalizedValue);
  if (invalidCharacter) {
    throw new DyadError(
      formatInvalidProviderApiKeyMessage(providerDisplayName, invalidCharacter),
      DyadErrorKind.Validation,
    );
  }
  return normalizedValue;
}
