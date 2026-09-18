import log from "electron-log";
import { FREE_PRO_MODEL_PROVIDER } from "@/lib/freeProModel";
import { ApiProtocolSchema } from "./api_protocol";
import { z } from "zod";
import { DyadError, DyadErrorKind } from "@/errors/dyad_error";
import type {
  LanguageModel,
  LanguageModelProvider,
} from "@/ipc/types/language-model";
import { EffortSettingsSchema } from "@/ipc/types/language-model";
import {
  ThemeGenerationModelOptionSchema,
  type ThemeGenerationModelOption,
} from "@/ipc/types/templates";
import {
  GEMINI_3_5_FLASH,
  GEMINI_3_1_PRO_PREVIEW,
  GPT_5_2_MODEL_NAME,
  GPT_5_5_MODEL_NAME,
  GPT_5_NANO,
  NEMOTRON_3_SUPER_FREE,
  OPUS_4_6,
  OPUS_4_8,
} from "./language_model_constants";

const logger = log.scope("remote_language_model_catalog");

const REMOTE_LANGUAGE_MODEL_CATALOG_TIMEOUT_MS = 5_000;
const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000;
const FALLBACK_CACHE_TTL_MS = 30 * 1000;

function getRemoteLanguageModelCatalogUrl(): string | null {
  if (process.env.DYAD_LANGUAGE_MODEL_CATALOG_URL) {
    return process.env.DYAD_LANGUAGE_MODEL_CATALOG_URL;
  }

  if (process.env.E2E_TEST_BUILD === "true" && process.env.FAKE_LLM_PORT) {
    return `http://localhost:${process.env.FAKE_LLM_PORT}/api/language-model-catalog`;
  }

  // 内网 / 离线版本：默认不再访问 https://api.dyad.sh 的云端模型目录，
  // 直接使用 app 内置目录（本地模型 + 自带 API Key 的供应商）。
  // 需要局域网镜像时，设置 DYAD_LANGUAGE_MODEL_CATALOG_URL 覆盖即可。
  return null;
}

export type { ThemeGenerationModelOption };

const CatalogProviderSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  type: z.literal("cloud"),
  hasFreeTier: z.boolean().optional(),
  websiteUrl: z.string().optional(),
  secondary: z.boolean().optional(),
  supportsThinking: z.boolean().optional(),
  gatewayPrefix: z.string().optional(),
});

const CatalogModelSchema = z.object({
  apiName: z.string(),
  displayName: z.string(),
  description: z.string(),
  tag: z.string().optional(),
  tagColor: z.string().optional(),
  dollarSigns: z.number().optional(),
  temperature: z.number().optional(),
  maxOutputTokens: z.number().optional(),
  contextWindow: z.number().optional(),
  effortSettings: EffortSettingsSchema.optional(),
  lifecycle: z
    .object({
      stage: z.enum(["stable", "preview", "deprecated"]).optional(),
    })
    .optional(),
});

const KNOWN_BUILTIN_MODEL_ALIASES = [
  "dyad/theme-generator/google",
  "dyad/theme-generator/anthropic",
  "dyad/theme-generator/openai",
  "dyad/auto/openai",
  "dyad/auto/anthropic",
  "dyad/auto/google",
  "dyad/auto/openrouter",
  "dyad/auto/balanced",
  "dyad/help-bot/default",
] as const;

export type BuiltinModelAlias = (typeof KNOWN_BUILTIN_MODEL_ALIASES)[number];

const LanguageModelCatalogResponseSchema = z.object({
  version: z.string(),
  expiresAt: z.string().datetime().optional(),
  providers: z.array(CatalogProviderSchema),
  modelsByProvider: z.record(z.string(), z.array(CatalogModelSchema)),
  aliases: z.array(
    z.object({
      id: z.string(),
      resolvedModel: z.object({
        providerId: z.string(),
        apiName: z.string(),
      }),
      displayName: z.string().optional(),
      purpose: z.enum(["theme-generation", "auto-mode", "help-bot"]).optional(),
      apiProtocol: ApiProtocolSchema.optional(),
    }),
  ),
  curatedSelections: z
    .object({
      themeGenerationOptions: z.array(ThemeGenerationModelOptionSchema),
    })
    .optional(),
});

type LanguageModelCatalogResponse = z.infer<
  typeof LanguageModelCatalogResponseSchema
>;

type BuiltinLanguageModelCatalog = {
  providers: LanguageModelProvider[];
  modelsByProvider: Record<string, LanguageModel[]>;
  aliases: LanguageModelCatalogResponse["aliases"];
  themeGenerationOptions: ThemeGenerationModelOption[];
  expiresAt: number;
  source: "fallback" | "remote";
  version?: string;
};

type ResolvedBuiltinModel = {
  providerId: string;
  apiName: string;
  apiProtocol?: z.infer<typeof ApiProtocolSchema>;
};

let builtinCatalogCache: BuiltinLanguageModelCatalog | null = null;
let builtinCatalogFetchPromise: Promise<BuiltinLanguageModelCatalog> | null =
  null;
// Tracks whether the current cache has already been extended through one
// stale-while-revalidate grace cycle. Bounds stale-remote service so a
// transient outage does not serve server-expired data indefinitely.
let staleCatalogGraceExtended = false;

const DEFAULT_THEME_GENERATION_OPTIONS: ThemeGenerationModelOption[] = [
  { id: "dyad/theme-generator/google", label: "Google" },
  { id: "dyad/theme-generator/anthropic", label: "Anthropic" },
  { id: "dyad/theme-generator/openai", label: "OpenAI" },
];

function buildFallbackCatalog(): BuiltinLanguageModelCatalog {
  // 内网 / 离线版本：内置云端渠道已移除，因此内置目录不再包含任何云端
  // 供应商与云端模型。下面的别名仅用于让仍依赖 Dyad Engine 的功能
  // （帮助机器人、主题生成、Auto）能解析出目标模型标识；对应渠道不存在时
  // 这些功能自然不可用。
  const providers: LanguageModelProvider[] = [];
  const modelsByProvider: Record<string, LanguageModel[]> = {};

  return {
    providers,
    modelsByProvider,
    aliases: [
      {
        id: "dyad/theme-generator/google",
        resolvedModel: {
          providerId: "google",
          apiName: GEMINI_3_1_PRO_PREVIEW,
        },
        displayName: "Google",
        purpose: "theme-generation",
      },
      {
        id: "dyad/theme-generator/anthropic",
        resolvedModel: {
          providerId: "anthropic",
          apiName: OPUS_4_6,
        },
        displayName: "Anthropic",
        purpose: "theme-generation",
      },
      {
        id: "dyad/theme-generator/openai",
        resolvedModel: {
          providerId: "openai",
          apiName: GPT_5_2_MODEL_NAME,
        },
        displayName: "OpenAI",
        purpose: "theme-generation",
      },
      {
        id: "dyad/auto/openai",
        resolvedModel: {
          providerId: "openai",
          apiName: GPT_5_5_MODEL_NAME,
        },
        displayName: "Auto OpenAI",
        purpose: "auto-mode",
      },
      {
        id: "dyad/auto/anthropic",
        resolvedModel: {
          providerId: "anthropic",
          apiName: OPUS_4_8,
        },
        displayName: "Auto Anthropic",
        purpose: "auto-mode",
      },
      {
        id: "dyad/auto/google",
        resolvedModel: {
          providerId: "google",
          apiName: GEMINI_3_5_FLASH,
        },
        displayName: "Auto Google",
        purpose: "auto-mode",
      },
      {
        id: "dyad/auto/openrouter",
        resolvedModel: {
          providerId: "openrouter",
          apiName: NEMOTRON_3_SUPER_FREE,
        },
        displayName: "Auto OpenRouter",
        purpose: "auto-mode",
      },
      {
        id: "dyad/auto/balanced",
        resolvedModel: {
          providerId: "openrouter",
          apiName: "x-ai/grok-4.6",
        },
        displayName: "Auto (balanced)",
        purpose: "auto-mode",
        apiProtocol: "responses",
      },
      {
        id: "dyad/help-bot/default",
        resolvedModel: {
          providerId: "openai",
          apiName: GPT_5_NANO,
        },
        displayName: "Help Bot",
        purpose: "help-bot",
      },
    ],
    themeGenerationOptions: DEFAULT_THEME_GENERATION_OPTIONS,
    expiresAt: Date.now() + FALLBACK_CACHE_TTL_MS,
    source: "fallback",
  };
}

function convertRemoteCatalog(
  remoteCatalog: LanguageModelCatalogResponse,
): BuiltinLanguageModelCatalog {
  const providers: LanguageModelProvider[] = remoteCatalog.providers
    .filter((provider) => provider.id !== FREE_PRO_MODEL_PROVIDER)
    .map((provider) => ({
      id: provider.id,
      name: provider.displayName,
      hasFreeTier: provider.hasFreeTier,
      websiteUrl: provider.websiteUrl,
      gatewayPrefix: provider.gatewayPrefix,
      secondary: provider.secondary,
      type: "cloud",
    }));

  const modelsByProvider = Object.fromEntries(
    Object.entries(remoteCatalog.modelsByProvider)
      .filter(([providerId]) => providerId !== FREE_PRO_MODEL_PROVIDER)
      .map(([providerId, models]) => [
        providerId,
        models.map((model) => ({
          apiName: model.apiName,
          displayName: model.displayName,
          description: model.description,
          tag: model.tag,
          tagColor: model.tagColor,
          maxOutputTokens: model.maxOutputTokens,
          contextWindow: model.contextWindow,
          temperature: model.temperature,
          dollarSigns: model.dollarSigns,
          effortSettings: model.effortSettings,
          type: "cloud" as const,
        })),
      ]),
  );

  const parsedExpiresAt = remoteCatalog.expiresAt
    ? new Date(remoteCatalog.expiresAt).getTime()
    : NaN;

  // Merge required builtin aliases that may be missing from the remote catalog.
  const fallback = buildFallbackCatalog();
  const remoteAliasIds = new Set(remoteCatalog.aliases.map((a) => a.id));
  const mergedAliases = [
    ...remoteCatalog.aliases,
    ...fallback.aliases.filter((a) => !remoteAliasIds.has(a.id)),
  ];

  return {
    providers,
    modelsByProvider,
    aliases: mergedAliases,
    themeGenerationOptions: remoteCatalog.curatedSelections
      ?.themeGenerationOptions?.length
      ? remoteCatalog.curatedSelections.themeGenerationOptions
      : DEFAULT_THEME_GENERATION_OPTIONS,
    expiresAt:
      Number.isFinite(parsedExpiresAt) && parsedExpiresAt > Date.now()
        ? parsedExpiresAt
        : Date.now() + DEFAULT_CACHE_TTL_MS,
    source: "remote",
    version: remoteCatalog.version,
  };
}

async function fetchRemoteCatalog(): Promise<BuiltinLanguageModelCatalog | null> {
  const catalogUrl = getRemoteLanguageModelCatalogUrl();
  if (!catalogUrl) {
    logger.info(
      "Remote language model catalog disabled; using built-in catalog",
    );
    return null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    REMOTE_LANGUAGE_MODEL_CATALOG_TIMEOUT_MS,
  );

  try {
    logger.info("Fetching remote language model catalog", {
      catalogUrl,
      timeoutMs: REMOTE_LANGUAGE_MODEL_CATALOG_TIMEOUT_MS,
    });

    const response = await fetch(catalogUrl, {
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new DyadError(
        `Failed to fetch language model catalog: ${response.status} ${response.statusText}`,
        DyadErrorKind.External,
      );
    }

    const rawCatalog = await response.json();
    const remoteCatalog = LanguageModelCatalogResponseSchema.parse(rawCatalog);
    const convertedCatalog = convertRemoteCatalog(remoteCatalog);

    logger.info("Loaded remote language model catalog", {
      catalogUrl,
      version: convertedCatalog.version,
      providerCount: convertedCatalog.providers.length,
      aliasCount: convertedCatalog.aliases.length,
      themeGenerationOptionCount:
        convertedCatalog.themeGenerationOptions.length,
    });

    return convertedCatalog;
  } catch (error) {
    logger.warn("Failed to fetch remote language model catalog", {
      catalogUrl,
      error,
    });
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

function getFallbackCatalog(): BuiltinLanguageModelCatalog {
  return buildFallbackCatalog();
}

function triggerBackgroundRefresh(): void {
  if (!builtinCatalogFetchPromise) {
    logger.info("Starting background refresh for language model catalog", {
      cachedSource: builtinCatalogCache?.source,
    });
    builtinCatalogFetchPromise = (async () => {
      try {
        const remoteCatalog = await fetchRemoteCatalog();
        if (remoteCatalog) {
          builtinCatalogCache = remoteCatalog;
          staleCatalogGraceExtended = false;
        } else if (!builtinCatalogCache) {
          builtinCatalogCache = getFallbackCatalog();
          staleCatalogGraceExtended = false;
        } else if (
          builtinCatalogCache.source === "remote" &&
          !staleCatalogGraceExtended
        ) {
          // The remote catalog is server-mutable and may diverge from the
          // app-release-pinned fallback (see the alias sync commits in
          // language_model_constants.ts). Preserve the stale-but-known remote
          // data across one bounded grace revalidation cycle so a transient
          // outage does not immediately re-route Auto mode to different upstream
          // models. The next failed refresh falls through to the app-vetted
          // fallback so we do not serve server-expired data indefinitely.
          builtinCatalogCache = {
            ...builtinCatalogCache,
            expiresAt: Date.now() + FALLBACK_CACHE_TTL_MS,
          };
          staleCatalogGraceExtended = true;
          logger.info(
            "Preserved stale remote language model catalog for one grace revalidation cycle",
            { version: builtinCatalogCache.version },
          );
        } else {
          builtinCatalogCache = getFallbackCatalog();
          staleCatalogGraceExtended = false;
        }
        logger.info("Background refresh completed for language model catalog", {
          source: builtinCatalogCache.source,
          version: builtinCatalogCache.version,
          providerCount: builtinCatalogCache.providers.length,
        });
        return builtinCatalogCache;
      } finally {
        builtinCatalogFetchPromise = null;
      }
    })();
  } else {
    logger.info(
      "Skipping language model catalog refresh because one is in flight",
    );
  }
}

export async function getBuiltinLanguageModelCatalog(): Promise<BuiltinLanguageModelCatalog> {
  if (builtinCatalogCache && builtinCatalogCache.expiresAt > Date.now()) {
    logger.debug("Returning cached language model catalog", {
      source: builtinCatalogCache.source,
      version: builtinCatalogCache.version,
      expiresAt: new Date(builtinCatalogCache.expiresAt).toISOString(),
    });
    return builtinCatalogCache;
  }

  // Serve stale data while revalidating in the background to avoid blocking
  // callers on a network fetch (stale-while-revalidate pattern).
  if (builtinCatalogCache) {
    logger.info(
      "Returning stale language model catalog and refreshing in background",
      {
        source: builtinCatalogCache.source,
        version: builtinCatalogCache.version,
      },
    );
    triggerBackgroundRefresh();
    return builtinCatalogCache;
  }

  // On cold start, wait for the initial remote fetch so renderer queries do not
  // cache fallback data and miss the later background refresh result.
  if (!builtinCatalogFetchPromise) {
    logger.info("Cold start catalog request; waiting for initial remote fetch");
    builtinCatalogFetchPromise = (async () => {
      try {
        const remoteCatalog = await fetchRemoteCatalog();
        builtinCatalogCache = remoteCatalog ?? getFallbackCatalog();
        logger.info(
          "Initialized language model catalog after cold start fetch",
          {
            source: builtinCatalogCache.source,
            version: builtinCatalogCache.version,
            providerCount: builtinCatalogCache.providers.length,
            aliasCount: builtinCatalogCache.aliases.length,
          },
        );
        return builtinCatalogCache;
      } finally {
        builtinCatalogFetchPromise = null;
      }
    })();
  } else {
    logger.info("Cold start catalog request is waiting on in-flight fetch");
  }

  return builtinCatalogFetchPromise;
}

export async function getThemeGenerationModelOptions(): Promise<
  ThemeGenerationModelOption[]
> {
  const catalog = await getBuiltinLanguageModelCatalog();
  return catalog.themeGenerationOptions;
}

export async function resolveBuiltinModelAlias(
  aliasId: BuiltinModelAlias | string,
): Promise<ResolvedBuiltinModel | null> {
  const catalog = await getBuiltinLanguageModelCatalog();
  const alias = catalog.aliases.find((candidate) => candidate.id === aliasId);
  const resolvedModel = alias
    ? { ...alias.resolvedModel, apiProtocol: alias.apiProtocol }
    : null;

  logger.info("Resolved builtin model alias", {
    aliasId,
    source: catalog.source,
    version: catalog.version,
    resolvedProviderId: resolvedModel?.providerId,
    resolvedApiName: resolvedModel?.apiName,
    apiProtocol: resolvedModel?.apiProtocol,
  });

  return resolvedModel;
}
