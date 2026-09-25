// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ipcHandlers: new Map<string, unknown>(),
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: unknown) => {
      mocks.ipcHandlers.set(channel, handler);
    }),
  },
}));

vi.mock("electron-log", () => ({
  default: { scope: () => mocks.logger },
}));

vi.mock("../utils/telemetry", () => ({
  sendTelemetryException: vi.fn(),
}));

vi.mock("../utils/test_utils", () => ({
  IS_TEST_BUILD: false,
}));

const { registerProHandlers } = await import("./pro_handlers");
registerProHandlers();

describe("offline build cloud handlers", () => {
  it("registers only the local user budget handler", () => {
    expect(mocks.ipcHandlers.has("get-user-budget")).toBe(true);
    // Dyad-cloud subscription/billing endpoints are removed in this build.
    expect(mocks.ipcHandlers.has("get-subscription-status")).toBe(false);
    expect(mocks.ipcHandlers.has("open-billing-action")).toBe(false);
  });
});
