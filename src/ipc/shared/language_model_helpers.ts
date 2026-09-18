import { db } from "@/db";
import {
  language_model_providers as languageModelProvidersSchema,
  language_models as languageModelsSchema,
} from "@/db/schema";
import type { LanguageModelProvider, LanguageModel } from "@/ipc/types";
import { eq } from "drizzle-orm";
import log from "electron-log";
import { LOCAL_PROVIDERS } from "./language_model_constants";
import { ApiProtocolSchema } from "./api_protocol";

const logger = log.scope("language_model_helpers");

/**
 * Fetches language model providers: the local providers (Ollama / LM Studio)
 * plus the custom providers the user defined.
 *
 * 内网 / 离线版本：内置云端渠道已全部移除，因此这里不再合并远端目录或
 * 硬编码的云供应商。
 */
export async function getLanguageModelProviders(): Promise<
  LanguageModelProvider[]
> {
  const customProvidersDb = await db
    .select()
    .from(languageModelProvidersSchema);

  const customProvidersMap = new Map<string, LanguageModelProvider>();
  for (const cp of customProvidersDb) {
    customProvidersMap.set(cp.id, {
      id: cp.id,
      name: cp.name,
      apiBaseUrl: cp.api_base_url,
      envVarName: cp.env_var_name ?? undefined,
      type: "custom",
      // 非法或历史遗留值一律归一化为 undefined（消费侧按 chat-completions 处理）。
      apiProtocol: ApiProtocolSchema.safeParse(cp.api_protocol).data,
      // hasFreeTier, websiteUrl, gatewayPrefix are not in the custom DB schema
      // They will be undefined unless overridden by hardcoded values if IDs match
    });
  }

  const localProviders: LanguageModelProvider[] = Object.entries(
    LOCAL_PROVIDERS,
  ).map(([id, details]) => ({
    id,
    name: details.displayName,
    hasFreeTier: details.hasFreeTier,
    type: "local" as const,
  }));

  logger.debug("Loaded language model providers", {
    localProviderCount: localProviders.length,
    customProviderCount: customProvidersMap.size,
  });

  return [...localProviders, ...customProvidersMap.values()];
}

/**
 * Fetches language models for a specific provider.
 *
 * Local providers have no static model list — the renderer discovers what the
 * local server is actually serving. This returns only the models the user saved
 * for the provider.
 */
export async function getLanguageModels({
  providerId,
}: {
  providerId: string;
}): Promise<LanguageModel[]> {
  const allProviders = await getLanguageModelProviders();
  const provider = allProviders.find((p) => p.id === providerId);

  if (!provider) {
    logger.warn(`Provider with ID "${providerId}" not found.`);
    return [];
  }

  try {
    const customModelsDb = await db
      .select({
        id: languageModelsSchema.id,
        displayName: languageModelsSchema.displayName,
        apiName: languageModelsSchema.apiName,
        description: languageModelsSchema.description,
        maxOutputTokens: languageModelsSchema.max_output_tokens,
        contextWindow: languageModelsSchema.context_window,
      })
      .from(languageModelsSchema)
      .where(
        isCustomProvider({ providerId })
          ? eq(languageModelsSchema.customProviderId, providerId)
          : eq(languageModelsSchema.builtinProviderId, providerId),
      );

    return customModelsDb.map((model) => ({
      ...model,
      description: model.description ?? "",
      tag: undefined,
      maxOutputTokens: model.maxOutputTokens ?? undefined,
      contextWindow: model.contextWindow ?? undefined,
      type: "custom" as const,
    }));
  } catch (error) {
    logger.error(
      `Error fetching custom models for provider "${providerId}" from DB:`,
      error,
    );
    return [];
  }
}

/**
 * Fetches all language models grouped by their provider IDs.
 */
export async function getLanguageModelsByProviders(): Promise<
  Record<string, LanguageModel[]>
> {
  const providers = await getLanguageModelProviders();

  const modelPromises = providers
    .filter((p) => p.type !== "local")
    .map(async (provider) => {
      const models = await getLanguageModels({ providerId: provider.id });
      return { providerId: provider.id, models };
    });

  const results = await Promise.all(modelPromises);

  const record: Record<string, LanguageModel[]> = {};
  for (const result of results) {
    record[result.providerId] = result.models;
  }

  return record;
}

export function isCustomProvider({ providerId }: { providerId: string }) {
  return providerId.startsWith(CUSTOM_PROVIDER_PREFIX);
}

export const CUSTOM_PROVIDER_PREFIX = "custom::";
