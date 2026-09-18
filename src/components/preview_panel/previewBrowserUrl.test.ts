import { describe, expect, it } from "vitest";
import { resolvePreviewBrowserUrl } from "./previewBrowserUrl";

describe("resolvePreviewBrowserUrl", () => {
  it("returns the preview URL", async () => {
    await expect(
      resolvePreviewBrowserUrl({ originalUrl: "http://127.0.0.1:3000" }),
    ).resolves.toBe("http://127.0.0.1:3000");
  });

  it("throws when no preview URL is available", async () => {
    await expect(
      resolvePreviewBrowserUrl({ originalUrl: null }),
    ).rejects.toThrow("Preview URL is unavailable.");
  });
});
