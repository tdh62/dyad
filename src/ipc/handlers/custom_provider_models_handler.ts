import log from "electron-log";
import { createTypedHandler } from "./base";
import { languageModelContracts } from "../types/language-model";
import type { DiscoveredModel } from "../types/language-model";
import { getLanguageModelProviders } from "../shared/language_model_helpers";
import { resolveApiProtocol, type ApiProtocol } from "../shared/api_protocol";
import { getEnvVar } from "../utils/read_env";
import { getTestFetchOption } from "../utils/test_fetch_override";
import { readSettings } from "@/main/settings";
import { DyadError, DyadErrorKind } from "@/errors/dyad_error";

const logger = log.scope("custom_provider_models_handler");

/** 模型列表请求的上限耗时：这是交互式操作，必须快速失败。 */
const LIST_MODELS_TIMEOUT_MS = 10_000;

/**
 * 认证头与实际推理请求保持同一协议约定，避免「能列模型却调不动」或反之。
 *
 * - `messages`（Anthropic）：`x-api-key` + `anthropic-version`
 * - `gemini`：`x-goog-api-key`
 * - 其余（含 chat-completions / responses）：`Authorization: Bearer`
 */
function buildDiscoveryHeaders(
  apiProtocol: ApiProtocol,
  apiKey: string | undefined,
): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (!apiKey) {
    return headers;
  }

  switch (apiProtocol) {
    case "messages":
      headers["x-api-key"] = apiKey;
      headers["anthropic-version"] = "2023-06-01";
      break;
    case "gemini":
      headers["x-goog-api-key"] = apiKey;
      break;
    default:
      headers["Authorization"] = `Bearer ${apiKey}`;
  }
  return headers;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * 宽松解析模型列表响应，覆盖实践中常见的几种形状：
 *
 * - OpenAI 系（vLLM、Ollama 的兼容层、one-api/new-api、LM Studio…）：`{ data: [{ id }] }`
 * - Gemini：`{ models: [{ name: "models/gemini-2.5-pro" }] }`
 * - 少数网关：直接返回数组或 `{ models: ["id", ...] }`
 *
 * 解析失败不抛错，返回空列表由调用方提示用户。
 */
function extractModels(payload: unknown): DiscoveredModel[] {
  const seen = new Set<string>();
  const models: DiscoveredModel[] = [];

  const push = (rawId: unknown, ownedBy?: unknown, created?: unknown) => {
    if (typeof rawId !== "string") {
      return;
    }
    // Gemini 返回 "models/<name>"，而请求模型时用的是裸名称。
    const id = rawId.replace(/^models\//, "").trim();
    if (!id || seen.has(id)) {
      return;
    }
    seen.add(id);
    models.push({
      id,
      ...(typeof ownedBy === "string" ? { ownedBy } : {}),
      ...(typeof created === "number" ? { created } : {}),
    });
  };

  let entries: unknown[];
  if (Array.isArray(payload)) {
    entries = payload;
  } else {
    const record = asRecord(payload);
    if (Array.isArray(record.data)) {
      entries = record.data;
    } else if (Array.isArray(record.models)) {
      entries = record.models;
    } else {
      entries = [];
    }
  }

  for (const entry of entries) {
    if (typeof entry === "string") {
      push(entry);
      continue;
    }
    const record = asRecord(entry);
    push(
      record.id ?? record.name ?? record.model,
      record.owned_by ?? record.ownedBy,
      record.created,
    );
  }

  return models.sort((left, right) => left.id.localeCompare(right.id));
}

/**
 * 用自定义 Provider 已保存的 Base URL 与 API Key 拉取其 `/models` 列表。
 *
 * 这样添加模型时可以从真实可用的模型里挑选，而不必手工输入模型 ID。
 */
export async function listCustomProviderModels(
  providerId: string,
): Promise<{ models: DiscoveredModel[] }> {
  const providers = await getLanguageModelProviders();
  const provider = providers.find((candidate) => candidate.id === providerId);

  if (!provider) {
    throw new DyadError(
      `Provider with ID "${providerId}" not found`,
      DyadErrorKind.NotFound,
    );
  }
  if (provider.type !== "custom") {
    throw new DyadError(
      "Only custom providers support fetching the remote model list.",
      DyadErrorKind.Validation,
    );
  }

  const baseUrl = provider.apiBaseUrl?.trim();
  if (!baseUrl) {
    throw new DyadError(
      `Provider "${providerId}" is missing the API Base URL.`,
      DyadErrorKind.Validation,
    );
  }

  const settings = readSettings();
  const rawKey =
    settings.providerSettings?.[providerId]?.apiKey?.value ??
    (provider.envVarName ? getEnvVar(provider.envVarName) : undefined);
  const apiKey = typeof rawKey === "string" ? rawKey.trim() : undefined;
  if (!apiKey) {
    throw new DyadError(
      "Add an API key for this provider before fetching its model list.",
      DyadErrorKind.Auth,
    );
  }

  const url = `${baseUrl.replace(/\/+$/, "")}/models`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LIST_MODELS_TIMEOUT_MS);
  const fetchImpl = getTestFetchOption().fetch ?? fetch;

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: buildDiscoveryHeaders(
        resolveApiProtocol(provider.apiProtocol),
        apiKey,
      ),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new DyadError(
        `The provider returned HTTP ${response.status} for ${url}. Check the base URL and API key.`,
        DyadErrorKind.External,
      );
    }

    const models = extractModels(await response.json());
    logger.info(
      `Discovered ${models.length} model(s) from custom provider ${providerId}`,
    );
    return { models };
  } catch (error) {
    if (error instanceof DyadError) {
      throw error;
    }
    const reason =
      error instanceof Error && error.name === "AbortError"
        ? `request timed out after ${LIST_MODELS_TIMEOUT_MS}ms`
        : error instanceof Error
          ? error.message
          : String(error);
    logger.warn(`Could not fetch models from ${url}: ${reason}`);
    throw new DyadError(
      `Could not fetch models from ${url}: ${reason}`,
      DyadErrorKind.External,
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

export function registerCustomProviderModelHandlers() {
  createTypedHandler(
    languageModelContracts.listCustomProviderModels,
    async (_event, params) => listCustomProviderModels(params.providerId),
  );
}
