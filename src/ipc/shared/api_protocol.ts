import { z } from "zod";

/**
 * 自定义 Provider 可选的线上协议。
 *
 * - `chat-completions`：OpenAI Chat Completions（默认，等同改造前的行为）
 * - `responses`：OpenAI Responses API
 * - `messages`：Anthropic Messages API
 * - `gemini`：Google Gemini generateContent API
 */
export const ApiProtocolSchema = z.enum([
  "chat-completions",
  "responses",
  "messages",
  "gemini",
]);

export type ApiProtocol = z.infer<typeof ApiProtocolSchema>;

/** 缺省协议：null / undefined 一律按此处理，保证既有数据行为不变。 */
export const DEFAULT_API_PROTOCOL: ApiProtocol = "chat-completions";

export const API_PROTOCOL_LABELS: Record<ApiProtocol, string> = {
  "chat-completions": "OpenAI Chat Completions",
  responses: "OpenAI Responses API",
  messages: "Anthropic Messages API",
  gemini: "Google Gemini API",
};

export const API_PROTOCOL_DESCRIPTIONS: Record<ApiProtocol, string> = {
  "chat-completions": "与 OpenAI /v1/chat/completions 兼容（最常见，默认值）",
  responses: "OpenAI Responses API（/v1/responses）",
  messages: "Anthropic Messages API（x-api-key 认证）",
  gemini: "Google Gemini generateContent API（x-goog-api-key 认证）",
};

/** 把可空协议归一化为具体值。 */
export function resolveApiProtocol(
  apiProtocol: ApiProtocol | null | undefined,
): ApiProtocol {
  return apiProtocol ?? DEFAULT_API_PROTOCOL;
}
