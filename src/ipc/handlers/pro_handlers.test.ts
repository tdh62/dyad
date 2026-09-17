// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { configureTrustedRenderer } from "@/ipc/utils/renderer_security";

const mocks = vi.hoisted(() => ({
  isTestBuild: true,
  ipcHandlers: new Map<string, (event: unknown, input: unknown) => unknown>(),
  openExternal: vi.fn(),
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn(
      (
        channel: string,
        handler: (event: unknown, input: unknown) => unknown,
      ) => {
        mocks.ipcHandlers.set(channel, handler);
      },
    ),
  },
  shell: { openExternal: mocks.openExternal },
}));

vi.mock("electron-log", () => ({
  default: { scope: () => mocks.logger },
}));

vi.mock("../utils/telemetry", () => ({
  sendTelemetryException: vi.fn(),
}));

vi.mock("../utils/test_utils", () => ({
  get IS_TEST_BUILD() {
    return mocks.isTestBuild;
  },
}));

const { getRegisteredHandlerForTesting } = await import("./base");
const { parseBillingActionUrl, registerProHandlers } =
  await import("./pro_handlers");

configureTrustedRenderer({
  devServerUrl: "http://localhost:5173",
  packagedRendererUrl: "file:///app/renderer/main_window/index.html",
});
registerProHandlers();

const getSubscriptionStatus = getRegisteredHandlerForTesting(
  "get-subscription-status",
);
const openBillingAction = getRegisteredHandlerForTesting("open-billing-action");

describe("offline build cloud handlers", () => {
  it("returns null for subscription status without contacting the network", async () => {
    await expect(
      getSubscriptionStatus({} as never, undefined),
    ).resolves.toBeNull();
  });

  it("rejects unsafe billing URLs", () => {
    for (const url of [
      "http://academy.dyad.sh/subscription",
      "https://example.com/subscription",
      "https://user:pass@academy.dyad.sh/subscription",
      "https://academy.dyad.sh:8443/subscription",
      "not a URL",
    ]) {
      expect(() => parseBillingActionUrl(url)).toThrow(
        "Invalid billing action URL",
      );
    }
  });

  it("accepts and opens an Academy HTTPS billing URL", async () => {
    const url = "https://academy.dyad.sh/subscription?source=app";
    expect(parseBillingActionUrl(url)).toBe(url);
    await expect(openBillingAction({} as never, url)).resolves.toBeUndefined();
    expect(mocks.openExternal).not.toHaveBeenCalled();
  });
});
