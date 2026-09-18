/**
 * 内网 / 离线版本：仅保留本地模型供应商（Ollama / LM Studio）。
 *
 * Dyad 内置的云端渠道（OpenAI、Anthropic、Google、Vertex、OpenRouter、
 * Azure、xAI、AWS Bedrock、MiniMax）以及 Dyad 自有的 `auto` 云端模型都已
 * 移除。云端能力只能通过用户自行配置的“自定义供应商”（OpenAI 兼容端点）
 * 获得，其定义来自数据库，不在此文件中。
 */
export const LOCAL_PROVIDERS: Record<
  string,
  {
    displayName: string;
    hasFreeTier: boolean;
  }
> = {
  ollama: {
    displayName: "Ollama",
    hasFreeTier: true,
  },
  lmstudio: {
    displayName: "LM Studio",
    hasFreeTier: true,
  },
};

/**
 * Model identifiers used by the Dyad-Engine benchmark evals
 * (`src/__tests__/evals`). They are plain strings, not provider definitions:
 * the app itself never routes to these models any more.
 */
export const GPT_5_2_MODEL_NAME = "gpt-5.2";
export const GPT_5_5_MODEL_NAME = "gpt-5.5";
export const GPT_5_6_LUNA_MODEL_NAME = "gpt-5.6-luna";
export const GPT_5_6_SOL_MODEL_NAME = "gpt-5.6-sol";
export const SONNET_4_6 = "claude-sonnet-4-6";
export const OPUS_4_6 = "claude-opus-4-6";
export const OPUS_4_8 = "claude-opus-4-8";
export const GEMINI_3_5_FLASH = "gemini-3.5-flash";
export const GEMINI_3_FLASH = "gemini-3-flash-preview";
export const GEMINI_3_1_PRO_PREVIEW = "gemini-3.1-pro-preview";
export const NEMOTRON_3_SUPER_FREE = "nvidia/nemotron-3-super-120b-a12b:free";
export const GPT_5_NANO = "gpt-5-nano";
