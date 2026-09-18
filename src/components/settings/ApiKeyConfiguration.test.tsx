import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiKeyConfiguration } from "./ApiKeyConfiguration";

function renderApiKeyConfiguration({
  isSaving = false,
}: {
  isSaving?: boolean;
} = {}) {
  return render(
    <ApiKeyConfiguration
      provider="custom::local"
      providerDisplayName="Local gateway"
      settings={
        {
          providerSettings: {
            "custom::local": {
              apiKey: { value: "test-key" },
            },
          },
        } as any
      }
      envVars={{}}
      envVarName="LOCAL_GATEWAY_API_KEY"
      isSaving={isSaving}
      saveError={null}
      apiKeyInput="new-key"
      onApiKeyInputChange={vi.fn()}
      onSaveKey={vi.fn()}
      onDeleteKey={vi.fn()}
      updateSettings={vi.fn()}
    />,
  );
}

describe("ApiKeyConfiguration", () => {
  it("shows the save button as saving and disables the other actions", () => {
    renderApiKeyConfiguration({ isSaving: true });

    expect(
      (screen.getByRole("button", { name: "Saving..." }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Paste & Save",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Deleting..." }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("offers a save action when idle", () => {
    renderApiKeyConfiguration();

    expect(screen.getByRole("button", { name: "Save Key" })).toBeTruthy();
  });
});
