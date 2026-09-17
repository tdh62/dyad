import { afterEach, describe, expect, test, vi } from "vitest";
import { generateText } from "ai";
import type { UserSettings } from "../../lib/schemas";
import type { ApiProtocol } from "../shared/api_protocol";
import { getLanguageModelProviders } from "../shared/language_model_helpers";
import {
  getModelClient,
  setModelClientFetchForTesting,
} from "./get_model_client";

vi.mock("electron-log", () => ({
  default: {
    scope: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

vi.mock("./model_effort", () => ({
  resolveModelSelection: vi.fn(async ({ model, preferredEffortLevel }) => ({
    ...model,
    effortLevel: preferredEffortLevel ?? "medium",
  })),
}));

// 自定义 provider 完全依赖自身配置，不查询远端模型目录。
vi.mock("../shared/language_model_helpers", () => ({
  getLanguageModels: vi.fn(async () => []),
  getLanguageModelProviders: vi.fn(async () => []),
}));

const SETTINGS = {
  providerSettings: {
    "custom::lan": { apiKey: { value: "lan-key" } },
  },
} as unknown as UserSettings;

/**
 * 以给定协议建立自定义 provider 的 model client，并发起一次请求，
 * 捕获实际使用的 URL 与请求头。
 *
 * 响应体刻意留空：本测试只关心「请求是否以该协议的官方 SDK 形状发出」，
 * 解析失败不影响结论。
 */
async function captureRequest(apiProtocol?: ApiProtocol) {
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  setModelClientFetchForTesting(
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedHeaders = new Headers(init?.headers);
      return new Response("{}", {
        headers: { "Content-Type": "application/json" },
      });
    }),
  );

  vi.mocked(getLanguageModelProviders).mockResolvedValue([
    {
      id: "custom::lan",
      name: "LAN",
      type: "custom",
      apiBaseUrl: "http://10.0.0.5:8000/v1",
      ...(apiProtocol ? { apiProtocol } : {}),
    },
  ]);

  const { modelClient } = await getModelClient(
    { provider: "custom::lan", name: "my-model" },
    SETTINGS,
  );

  await generateText({
    model: modelClient.model,
    prompt: "hi",
    maxRetries: 0,
  }).catch(() => undefined);

  return { modelClient, capturedUrl, capturedHeaders };
}

afterEach(() => {
  setModelClientFetchForTesting(undefined);
  vi.clearAllMocks();
});

describe("custom provider API protocol dispatch", () => {
  test("defaults to OpenAI Chat Completions when the protocol is unset", async () => {
    const { modelClient, capturedUrl, capturedHeaders } =
      await captureRequest(undefined);

    expect(modelClient.apiProtocol).toBe("chat-completions");
    expect(capturedUrl).toContain("/chat/completions");
    expect(capturedHeaders?.get("Authorization")).toBe("Bearer lan-key");
  });

  test("uses the Responses API request shape", async () => {
    const { modelClient, capturedUrl, capturedHeaders } =
      await captureRequest("responses");

    expect(modelClient.apiProtocol).toBe("responses");
    expect(capturedUrl).toContain("/responses");
    expect(capturedHeaders?.get("Authorization")).toBe("Bearer lan-key");
  });

  test("uses the Anthropic Messages shape with x-api-key auth", async () => {
    const { modelClient, capturedUrl, capturedHeaders } =
      await captureRequest("messages");

    expect(modelClient.apiProtocol).toBe("messages");
    expect(capturedUrl).toContain("/messages");
    expect(capturedHeaders?.get("x-api-key")).toBe("lan-key");
    expect(capturedHeaders?.get("anthropic-version")).toBeTruthy();
  });

  test("uses the Gemini generateContent shape with x-goog-api-key auth", async () => {
    const { modelClient, capturedUrl, capturedHeaders } =
      await captureRequest("gemini");

    expect(modelClient.apiProtocol).toBe("gemini");
    expect(capturedUrl).toContain("generateContent");
    expect(capturedHeaders?.get("x-goog-api-key")).toBe("lan-key");
  });

  test("still rejects Dyad cloud models instead of falling back", async () => {
    await expect(
      getModelClient({ provider: "auto", name: "auto" }, SETTINGS),
    ).rejects.toThrow(/Dyad cloud models are not available/);
  });
});
