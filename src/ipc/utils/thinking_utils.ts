import type { AnthropicProviderOptions } from "@ai-sdk/anthropic";
import type { ModelSelection } from "../../lib/schemas";

export function getModelEffort(modelSelection: ModelSelection): string {
  return modelSelection.effortLevel;
}

// The engine fetch wrapper adds reasoning options for the resolved provider
// family. OpenAI requests use the Responses API body format.
export function getExtraProviderOptionsForEngine(
  providerId: string | undefined,
  modelSelection: ModelSelection,
): Record<string, any> {
  if (!providerId) {
    return {};
  }
  if (providerId === "openai") {
    // OpenAI uses the same provider options because the Dyad Engine
    // is implemented as an OpenAI-compatible provider.
    return getOpenAIProviderOptions(modelSelection);
  }
  if (providerId === "anthropic") {
    return getAnthropicEngineThinkingOptions(modelSelection);
  }
  return {};
}

export function getGeminiThinkingBudgetTokens(effortLevel: string): number {
  switch (effortLevel) {
    case "minimal":
      return 0;
    case "low":
      return 1_000;
    case "medium":
      return 4_000;
    case "high":
      // -1 lets Gemini dynamically decide its budget (its max).
      return -1;
    default:
      return 4_000; // Default to medium
  }
}

// This is the engine-specicific (LiteLLM) thinking configuration
function getAnthropicEngineThinkingOptions(modelSelection: ModelSelection) {
  return {
    thinking: {
      type: "adaptive",
      display: "summarized",
    },
    // Use anthropic's native effort config.
    output_config: { effort: getModelEffort(modelSelection) },
  };
}

// This is the regular AI-SDK Anthropic provider options.
export function getAnthropicProviderOptions(
  modelSelection: ModelSelection,
): AnthropicProviderOptions {
  return {
    thinking: {
      type: "adaptive",
      display: "summarized",
    },
    effort: getModelEffort(
      modelSelection,
    ) as AnthropicProviderOptions["effort"],
    sendReasoning: true,
  };
}

export function getOpenAIProviderOptions(modelSelection: ModelSelection) {
  const effort = getModelEffort(modelSelection);

  return {
    reasoning: {
      summary: "detailed",
      effort,
    },
    include: ["reasoning.encrypted_content"],
    store: false,
  };
}
