import { z } from "zod";
import { defineContract, createClient } from "../contracts/core";
import { ApiProtocolSchema } from "../shared/api_protocol";

// =============================================================================
// Language Model Schemas
// =============================================================================

export const LanguageModelProviderSchema = z.object({
  id: z.string(),
  name: z.string(),
  hasFreeTier: z.boolean().optional(),
  websiteUrl: z.string().optional(),
  gatewayPrefix: z.string().optional(),
  secondary: z.boolean().optional(),
  envVarName: z.string().optional(),
  apiBaseUrl: z.string().optional(),
  type: z.enum(["custom", "local", "cloud"]),
  isCustom: z.boolean().optional(),
  /**
   * 自定义 Provider 的线上协议。未设置时按 `chat-completions` 处理，
   * 因此既有 provider 无需迁移即可保持原有行为。
   */
  apiProtocol: ApiProtocolSchema.optional(),
});

export type LanguageModelProvider = z.infer<typeof LanguageModelProviderSchema>;

export const EffortSettingsSchema = z
  .object({
    defaultEffortLevel: z.string().trim().min(1),
    possibleEffortLevels: z
      .array(z.string().trim().min(1))
      .min(1)
      .refine((levels) => new Set(levels).size === levels.length, {
        message: "Effort levels must be unique",
      }),
  })
  .refine(
    ({ defaultEffortLevel, possibleEffortLevels }) =>
      possibleEffortLevels.includes(defaultEffortLevel),
    { message: "Default effort level must be included in possible levels" },
  );

export type EffortSettings = z.infer<typeof EffortSettingsSchema>;

export const LanguageModelSchema = z.object({
  id: z.number().optional(),
  apiName: z.string(),
  displayName: z.string(),
  description: z.string().optional(),
  tag: z.string().optional(),
  tagColor: z.string().optional(),
  maxOutputTokens: z.number().optional(),
  contextWindow: z.number().optional(),
  temperature: z.number().optional(),
  dollarSigns: z.number().optional(),
  effortSettings: EffortSettingsSchema.optional(),
  type: z.enum(["custom", "local", "cloud"]).optional(),
});

export type LanguageModel = z.infer<typeof LanguageModelSchema>;

export const LocalModelSchema = z.object({
  provider: z.enum(["ollama", "lmstudio"]),
  modelName: z.string(),
  displayName: z.string(),
});

export type LocalModel = z.infer<typeof LocalModelSchema>;

export const CreateCustomLanguageModelProviderParamsSchema = z.object({
  id: z.string(),
  name: z.string(),
  apiBaseUrl: z.string(),
  envVarName: z.string().optional(),
  /** 缺省为 `chat-completions`（等价于改造前的行为）。 */
  apiProtocol: ApiProtocolSchema.optional(),
});

export type CreateCustomLanguageModelProviderParams = z.infer<
  typeof CreateCustomLanguageModelProviderParamsSchema
>;

export const CreateCustomLanguageModelParamsSchema = z.object({
  apiName: z.string(),
  displayName: z.string(),
  providerId: z.string(),
  description: z.string().optional(),
  maxOutputTokens: z.number().optional(),
  contextWindow: z.number().optional(),
});

export type CreateCustomLanguageModelParams = z.infer<
  typeof CreateCustomLanguageModelParamsSchema
>;

export const UpdateCustomLanguageModelParamsSchema =
  CreateCustomLanguageModelParamsSchema.extend({ id: z.number() });

export type UpdateCustomLanguageModelParams = z.infer<
  typeof UpdateCustomLanguageModelParamsSchema
>;

export const DeleteCustomModelParamsSchema = z.object({
  providerId: z.string(),
  modelApiName: z.string(),
});

/**
 * 自定义 Provider 通过远端 `GET {baseUrl}/models` 发现的模型条目。
 *
 * 只保留 UI 需要的最小字段，避免把供应商返回的其余内容一并带到渲染进程。
 */
export const DiscoveredModelSchema = z.object({
  /** 可直接填入「Model ID」的标识，已去掉 Gemini 的 `models/` 前缀。 */
  id: z.string(),
  /** 供应商声明的归属方（OpenAI 风格的 `owned_by`）。 */
  ownedBy: z.string().optional(),
  created: z.number().optional(),
});

export type DiscoveredModel = z.infer<typeof DiscoveredModelSchema>;

export const ListCustomProviderModelsParamsSchema = z.object({
  providerId: z.string(),
});

export type ListCustomProviderModelsParams = z.infer<
  typeof ListCustomProviderModelsParamsSchema
>;

// =============================================================================
// Language Model Contracts
// =============================================================================

export const languageModelContracts = {
  getProviders: defineContract({
    channel: "get-language-model-providers",
    input: z.void(),
    output: z.array(LanguageModelProviderSchema),
  }),

  getModels: defineContract({
    channel: "get-language-models",
    input: z.object({ providerId: z.string() }),
    output: z.array(LanguageModelSchema),
  }),

  getModelsByProviders: defineContract({
    channel: "get-language-models-by-providers",
    input: z.void(),
    output: z.record(z.string(), z.array(LanguageModelSchema)),
  }),

  createCustomProvider: defineContract({
    channel: "create-custom-language-model-provider",
    input: CreateCustomLanguageModelProviderParamsSchema,
    output: LanguageModelProviderSchema,
  }),

  editCustomProvider: defineContract({
    channel: "edit-custom-language-model-provider",
    input: CreateCustomLanguageModelProviderParamsSchema,
    output: LanguageModelProviderSchema,
  }),

  deleteCustomProvider: defineContract({
    channel: "delete-custom-language-model-provider",
    input: z.object({ providerId: z.string() }),
    output: z.void(),
  }),

  createCustomModel: defineContract({
    channel: "create-custom-language-model",
    input: CreateCustomLanguageModelParamsSchema,
    output: z.number(),
  }),

  updateCustomModel: defineContract({
    channel: "update-custom-language-model",
    input: UpdateCustomLanguageModelParamsSchema,
    output: z.number(),
  }),

  deleteCustomModel: defineContract({
    channel: "delete-custom-language-model",
    input: z.string(), // modelId
    output: z.void(),
  }),

  deleteModel: defineContract({
    channel: "delete-custom-model",
    input: DeleteCustomModelParamsSchema,
    output: z.void(),
  }),

  listOllamaModels: defineContract({
    channel: "local-models:list-ollama",
    input: z.void(),
    output: z.object({ models: z.array(LocalModelSchema) }),
  }),

  listLMStudioModels: defineContract({
    channel: "local-models:list-lmstudio",
    input: z.void(),
    output: z.object({ models: z.array(LocalModelSchema) }),
  }),

  /**
   * 用自定义 Provider 已配置的 Base URL 与 API Key 请求其 `/models`，
   * 让用户从真实可用模型中选择，而不是手工输入模型 ID。
   */
  listCustomProviderModels: defineContract({
    channel: "custom-provider:list-models",
    input: ListCustomProviderModelsParamsSchema,
    output: z.object({ models: z.array(DiscoveredModelSchema) }),
  }),
} as const;

// =============================================================================
// Language Model Client
// =============================================================================

export const languageModelClient = createClient(languageModelContracts);
