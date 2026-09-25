import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatErrorBox } from "./ChatErrorBox";

const mocks = vi.hoisted(() => ({
  openExternalUrl: vi.fn(),
}));

vi.mock("@/ipc/types", () => ({
  ipc: { system: { openExternalUrl: mocks.openExternalUrl } },
}));

vi.mock("@/hooks/useFreeAgentQuota", () => ({
  useFreeAgentQuota: () => ({
    messagesLimit: 10,
    resetTime: null,
  }),
}));

vi.mock("@/hooks/useFreeModelQuota", () => ({
  useFreeModelQuota: () => ({
    messagesLimit: 5,
    resetTime: null,
  }),
}));

describe("ChatErrorBox Basic Agent quota error", () => {
  beforeEach(() => {
    mocks.openExternalUrl.mockReset();
  });

  it("offers a non-retrying Build switch without a Dyad Pro upgrade link", () => {
    const onDismiss = vi.fn();
    const onSwitchToBuildMode = vi.fn();

    render(
      <ChatErrorBox
        error='{"type":"FREE_AGENT_QUOTA_EXCEEDED","resetTime":1787295600000}'
        isDyadProEnabled={false}
        onDismiss={onDismiss}
        onSwitchToBuildMode={onSwitchToBuildMode}
      />,
    );

    expect(
      screen.getByText(/used all 10 free Basic Agent messages/),
    ).toBeTruthy();
    expect(screen.getByText(/Your quota resets at/)).toBeTruthy();
    expect(screen.queryByText(/Dyad Pro/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Switch to Build" }));
    expect(onSwitchToBuildMode).toHaveBeenCalledOnce();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("explains that Dyad Free must be changed before using Build", () => {
    render(
      <ChatErrorBox
        error='{"type":"FREE_AGENT_QUOTA_EXCEEDED","resetTime":1787295600000}'
        isDyadProEnabled={false}
        onDismiss={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/first choose a model other than Dyad Free/),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Switch to Build" }),
    ).toBeNull();
  });
});

describe("ChatErrorBox error presentation", () => {
  it("bounds long string errors in a scrollable region", () => {
    render(
      <ChatErrorBox
        error={`Implementer failures:\n${"Detailed failure line\n".repeat(200)}`}
        isDyadProEnabled
        onDismiss={vi.fn()}
      />,
    );

    const scrollRegion = screen
      .getByTestId("chat-error-box")
      .querySelector(".overflow-y-auto");
    expect(scrollRegion?.className).toContain("max-h-64");
    expect(scrollRegion?.className).toContain("scrollbar-on-hover");
  });
});
