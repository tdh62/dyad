import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ModelPicker } from "./ModelPicker";
vi.mock("./SubscriptionModelMenu", () => ({
  SubscriptionModelMenu: ({ children }: { children: React.ReactNode }) =>
    children,
}));
vi.mock("@/hooks/useSubscriptionAccount", () => ({
  useSubscriptionAccount: () => ({
    isLoading: mocks.subscriptionLoading,
    data: mocks.subscriptionUnavailable
      ? undefined
      : {
          connected: mocks.subscriptionConnected,
          models: ["gpt-5"],
          windows: [],
          limitReached: false,
        },
  }),
}));

const mocks = vi.hoisted(() => ({
  subscriptionUnavailable: false,
  subscriptionLoading: false,
  subscriptionConnected: true,
  invalidateQueries: vi.fn(),
  setChatMode: vi.fn(),
  setChatModelSelection: vi.fn(),
  setChatSelection: vi.fn(),
  updateSettings: vi.fn(),
  updateChat: vi.fn(),
  navigate: vi.fn(),
  posthogCapture: vi.fn(),
  openExternalUrl: vi.fn(),
  loadOllamaModels: vi.fn(),
  loadLMStudioModels: vi.fn(),
  dropdownOpenChange: null as null | ((open: boolean) => void),
  preventBaseUIHandler: vi.fn(),
  selectedMode: "build",
  isTrial: false,
  renderSubContent: false,
  catalogLoading: false,
  catalogUnavailable: false,
  catalogError: null as Error | null,
  settingsAvailable: true,
  settingsLoading: false,
  chatLoading: false,
  chat: null as null | {
    id: number;
    messages: Array<{ id: number }>;
    modelSelection?: {
      provider: string;
      name: string;
      effortLevel: string;
    };
  },
  pathname: "/",
  search: {} as { id?: number },
  envVars: {} as Record<string, string | undefined>,
  ollamaModels: [] as Array<{
    provider: "ollama";
    modelName: string;
    displayName: string;
  }>,
  ollamaError: null as Error | null,
  lmStudioModels: [] as Array<{
    provider: "lmstudio";
    modelName: string;
    displayName: string;
  }>,
  lmStudioError: null as Error | null,
  freeModelQuota: {
    quotaStatus: {
      messagesUsed: 3,
      messagesLimit: 5,
      messagesRemaining: 2,
      isQuotaExceeded: false,
      resetTime: new Date("2026-06-26T00:00:00Z").getTime(),
    } as {
      messagesUsed: number;
      messagesLimit: number;
      messagesRemaining: number;
      isQuotaExceeded: boolean;
      resetTime: number;
    } | null,
    isLoading: false,
    error: null as Error | null,
    isQuotaExceeded: false,
    messagesUsed: 3,
    messagesLimit: 5,
    messagesRemaining: 2,
    resetTime: new Date("2026-06-26T00:00:00Z").getTime(),
  },
  settings: {
    proModelUsage: "subscription" as "subscription" | "pro",
    enableDyadPro: true,
    providerSettings: {
      openrouter: {
        apiKey: {
          value: "",
        },
      },
    },
    selectedModel: {
      name: "gpt-5-mini",
      provider: "openai",
    } as { name: string; provider: string; customModelId?: number },
    recentModels: [] as
      | Array<{
          name: string;
          provider: string;
          customModelId?: number;
        }>
      | undefined,
    selectedChatMode: "build",
    defaultChatMode: "build",
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: mocks.invalidateQueries,
  }),
}));

vi.mock("@/hooks/useSettings", () => ({
  useSettings: () => ({
    settings: mocks.settingsAvailable ? mocks.settings : null,
    updateSettings: mocks.updateSettings,
    envVars: mocks.envVars,
    loading: mocks.settingsLoading,
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  useRouterState: () => ({
    location: {
      pathname: mocks.pathname,
      search: mocks.search,
    },
  }),
  useNavigate: () => mocks.navigate,
}));

vi.mock("posthog-js/react", () => ({
  usePostHog: () => ({
    capture: mocks.posthogCapture,
  }),
}));

vi.mock("@/routes/settings/providers/$provider", () => ({
  providerSettingsRoute: {
    id: "/settings/providers/$provider",
  },
}));

vi.mock("@/ipc/types", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ipc: {
    chat: {
      updateChat: mocks.updateChat,
    },
    system: {
      openExternalUrl: mocks.openExternalUrl,
    },
  },
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/hooks/useChatMode", () => ({
  useChatMode: () => ({
    chat: mocks.chat,
    isLoading: mocks.chatLoading,
    selectedMode: mocks.selectedMode,
    setChatMode: mocks.setChatMode,
    setChatModelSelection: mocks.setChatModelSelection,
    setChatSelection: mocks.setChatSelection,
  }),
}));

vi.mock("@/hooks/useTrialModelRestriction", () => ({
  useTrialModelRestriction: () => ({
    isTrial: mocks.isTrial,
    isLoadingTrialStatus: false,
  }),
}));

vi.mock("@/hooks/useFreeModelQuota", () => ({
  useFreeModelQuota: () => mocks.freeModelQuota,
}));

vi.mock("@/hooks/useLanguageModelsByProviders", () => ({
  useLanguageModelsByProviders: () => ({
    isLoading: mocks.catalogLoading,
    error: mocks.catalogError,
    data: mocks.catalogUnavailable
      ? undefined
      : {
          openai: [
            {
              apiName: "gpt-5-mini",
              displayName: "GPT 5 Mini",
              description: "OpenAI smaller model",
              dollarSigns: 2,
              type: "cloud",
            },
            {
              apiName: "gpt-5",
              displayName: "GPT 5",
              description: "OpenAI model",
              dollarSigns: 3,
              effortSettings: {
                defaultEffortLevel: "minimal",
                possibleEffortLevels: ["minimal", "xhigh"],
              },
              type: "cloud",
            },
          ],
          google: [
            {
              apiName: "gemini-2.5-pro",
              displayName: "Gemini 2.5 Pro",
              description: "Google model",
              dollarSigns: 2,
              type: "cloud",
            },
            {
              apiName: "gemini-2.5-flash",
              displayName: "Gemini 2.5 Flash",
              description: "Google flash model",
              dollarSigns: 2,
              type: "cloud",
            },
          ],
          vertex: [
            {
              apiName: "gemini-2.5-pro",
              displayName: "Vertex Gemini 2.5 Pro",
              description: "Vertex model with price metadata",
              dollarSigns: 3,
              type: "cloud",
            },
          ],
          openrouter: [
            {
              apiName: "openrouter/free",
              displayName: "Free (OpenRouter)",
              description: "Free OpenRouter model",
              type: "cloud",
            },
            {
              apiName: "anthropic/claude-sonnet-4.5",
              displayName: "Claude Sonnet 4.5",
              description: "OpenRouter paid model",
              dollarSigns: 2,
              type: "cloud",
            },
          ],
          xai: [
            {
              apiName: "grok-code-fast-1",
              displayName: "Grok Code Fast",
              description: "xAI model",
              type: "cloud",
            },
          ],
          custom: [
            {
              id: 1,
              apiName: "shared-model",
              displayName: "Custom A",
              type: "custom",
            },
            {
              id: 2,
              apiName: "shared-model",
              displayName: "Custom B",
              type: "custom",
            },
            {
              id: 3,
              apiName: "team/free",
              displayName: "Custom Free",
              type: "custom",
            },
          ],
        },
  }),
}));

vi.mock("@/hooks/useLanguageModelProviders", () => ({
  useLanguageModelProviders: () => ({
    isLoading: false,
    isProviderSetup: (provider: string) => {
      if (provider === "openrouter") {
        return Boolean(
          mocks.settings.providerSettings.openrouter.apiKey.value ||
          mocks.envVars.OPENROUTER_API_KEY,
        );
      }
      return false;
    },
    data: [
      {
        id: "openai",
        name: "OpenAI",
        type: "cloud",
      },
      {
        id: "google",
        name: "Google",
        type: "cloud",
      },
      {
        id: "vertex",
        name: "Google Vertex AI",
        type: "cloud",
        secondary: true,
      },
      {
        id: "openrouter",
        name: "OpenRouter",
        type: "cloud",
      },
      {
        id: "xai",
        name: "xAI",
        type: "cloud",
        secondary: true,
      },
      {
        id: "custom",
        name: "Custom Provider",
        type: "custom",
      },
    ],
  }),
}));

vi.mock("@/hooks/useLocalModels", () => ({
  useLocalModels: () => ({
    models: mocks.ollamaModels,
    loading: false,
    error: mocks.ollamaError,
    loadModels: mocks.loadOllamaModels,
  }),
}));

vi.mock("@/hooks/useLMStudioModels", () => ({
  useLocalLMSModels: () => ({
    models: mocks.lmStudioModels,
    loading: false,
    error: mocks.lmStudioError,
    loadModels: mocks.loadLMStudioModels,
  }),
}));

vi.mock("@/components/PriceBadge", () => ({
  PriceBadge: () => <span data-testid="price-badge" />,
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ render }: { render: React.ReactElement }) => render,
  TooltipContent: () => null,
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({
    children,
    onOpenChange,
  }: {
    children: React.ReactNode;
    onOpenChange?: (open: boolean) => void;
  }) => {
    mocks.dropdownOpenChange = onOpenChange ?? null;
    return <div>{children}</div>;
  },
  DropdownMenuTrigger: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
  }) => <button {...props}>{children}</button>,
  DropdownMenuContent: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <div className={className} data-testid="model-picker-dropdown">
      {children}
    </div>
  ),
  DropdownMenuItem: ({ children, ...props }: { children: React.ReactNode }) => (
    <button {...props}>{children}</button>
  ),
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuSeparator: () => <hr data-slot="dropdown-menu-separator" />,
  DropdownMenuSub: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuSubTrigger: ({
    children,
    hideChevron: _hideChevron,
    openOnHover,
    delay,
    closeDelay,
    onMouseDown,
    onClick,
    ...props
  }: {
    children: React.ReactNode;
    hideChevron?: boolean;
    openOnHover?: boolean;
    delay?: number;
    closeDelay?: number;
    onMouseDown?: (
      event: React.MouseEvent<HTMLButtonElement> & {
        preventBaseUIHandler: () => void;
      },
    ) => void;
    onClick?: (
      event: React.MouseEvent<HTMLButtonElement> & {
        preventBaseUIHandler: () => void;
      },
    ) => void;
  }) => (
    <button
      {...props}
      data-open-on-hover={openOnHover || undefined}
      data-hover-delay={delay}
      data-close-delay={closeDelay}
      onMouseDown={(event) =>
        onMouseDown?.(
          Object.assign(event, {
            preventBaseUIHandler: mocks.preventBaseUIHandler,
          }),
        )
      }
      onClick={(event) =>
        onClick?.(
          Object.assign(event, {
            preventBaseUIHandler: mocks.preventBaseUIHandler,
          }),
        )
      }
    >
      {children}
    </button>
  ),
  DropdownMenuSubContent: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
  }) => (mocks.renderSubContent ? <div {...props}>{children}</div> : null),
}));

describe("ModelPicker", () => {
  beforeEach(() => {
    mocks.subscriptionUnavailable = false;
    mocks.subscriptionLoading = false;
    mocks.subscriptionConnected = true;
    mocks.settings.proModelUsage = "subscription";
    mocks.invalidateQueries.mockReset();
    mocks.setChatMode.mockReset();
    mocks.setChatMode.mockResolvedValue(undefined);
    mocks.setChatModelSelection.mockReset();
    mocks.setChatModelSelection.mockResolvedValue(undefined);
    mocks.setChatSelection.mockReset();
    mocks.setChatSelection.mockResolvedValue(undefined);
    mocks.updateSettings.mockReset();
    mocks.updateSettings.mockResolvedValue(mocks.settings);
    mocks.updateChat.mockReset();
    mocks.updateChat.mockResolvedValue(undefined);
    mocks.navigate.mockReset();
    mocks.posthogCapture.mockReset();
    mocks.openExternalUrl.mockReset();
    mocks.loadOllamaModels.mockReset();
    mocks.loadOllamaModels.mockResolvedValue(undefined);
    mocks.loadLMStudioModels.mockReset();
    mocks.loadLMStudioModels.mockResolvedValue(undefined);
    mocks.dropdownOpenChange = null;
    mocks.preventBaseUIHandler.mockReset();
    mocks.selectedMode = "build";
    mocks.renderSubContent = false;
    mocks.catalogLoading = false;
    mocks.catalogUnavailable = false;
    mocks.catalogError = null;
    mocks.settingsAvailable = true;
    mocks.settingsLoading = false;
    mocks.chatLoading = false;
    mocks.chat = null;
    mocks.pathname = "/";
    mocks.search = {};
    mocks.envVars = {};
    mocks.ollamaModels = [];
    mocks.ollamaError = null;
    mocks.lmStudioModels = [];
    mocks.lmStudioError = null;
    mocks.settings.enableDyadPro = true;
    mocks.settings.providerSettings.openrouter.apiKey.value = "";
    mocks.settings.selectedModel = { name: "gpt-5-mini", provider: "openai" };
    mocks.settings.recentModels = [];
    mocks.settings.selectedChatMode = "build";
    mocks.settings.defaultChatMode = "build";
    mocks.isTrial = false;
    mocks.freeModelQuota.isQuotaExceeded = false;
    mocks.freeModelQuota.error = null;
    mocks.freeModelQuota.messagesRemaining = 2;
    mocks.freeModelQuota.quotaStatus = {
      messagesUsed: 3,
      messagesLimit: 5,
      messagesRemaining: 2,
      isQuotaExceeded: false,
      resetTime: new Date("2026-06-26T00:00:00Z").getTime(),
    };
  });

  it("never offers the removed Dyad models in the root menu", () => {
    render(<ModelPicker />);

    expect(screen.queryByText("Auto Sidekick")).toBeNull();
    expect(screen.queryByText("Auto (balanced)")).toBeNull();
    expect(screen.queryByText("Dyad Free")).toBeNull();
    // Catalog contents stay behind the submenu.
    expect(screen.queryByText("GPT 5")).toBeNull();
    expect(screen.queryByText("Local providers")).toBeNull();
    expect(screen.getByText("All models")).toBeTruthy();
  });

  it("keeps All models stationary while the cloud catalog loads", () => {
    mocks.catalogLoading = true;
    const { rerender } = render(<ModelPicker />);
    const allModelsTrigger = screen.getByText("All models").closest("button");

    mocks.catalogLoading = false;
    rerender(<ModelPicker />);

    expect(screen.getByText("All models").closest("button")).toBe(
      allModelsTrigger,
    );
  });

  it("puts Recent above the All models entry point", () => {
    mocks.settings.recentModels = [{ provider: "openai", name: "gpt-5" }];

    render(<ModelPicker />);

    const recentRow = document.querySelector(
      '[data-model-provider="openai"][data-model-name="gpt-5"]',
    )!;
    const allModels = screen.getByText("All models").closest("button")!;
    expect(
      recentRow.compareDocumentPosition(allModels) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows up to five persisted specific models in a Recent section", () => {
    mocks.settings.recentModels = [
      { provider: "openai", name: "gpt-5" },
      {
        provider: "openrouter",
        name: "anthropic/claude-sonnet-4.5",
      },
      { provider: "auto", name: "auto-sidekick" },
    ];

    render(<ModelPicker />);

    expect(screen.getByText("Recent")).toBeTruthy();
    expect(screen.getByText("GPT 5")).toBeTruthy();
    expect(screen.getByText("Claude Sonnet 4.5")).toBeTruthy();
    const gptRow = screen.getByText("GPT 5").closest("button")!;
    expect(within(gptRow).queryByText("OpenAI")).toBeNull();
    expect(gptRow.getAttribute("aria-label")).not.toContain("OpenAI");
    // A legacy Dyad entry in the persisted history is dropped, not resurrected.
    expect(screen.queryByText("Auto Sidekick")).toBeNull();
  });

  it("preserves unresolved cloud history when adding a recent model", async () => {
    mocks.renderSubContent = true;
    mocks.settings.recentModels = [
      { provider: "openai", name: "deleted-model" },
      { provider: "openai", name: "gpt-5" },
      { provider: "openai", name: "gpt-5-mini" },
      { provider: "google", name: "gemini-2.5-pro" },
      { provider: "google", name: "gemini-2.5-flash" },
    ];

    render(<ModelPicker />);
    fireEvent.click(
      document.querySelector(
        '[data-model-provider="xai"][data-model-name="grok-code-fast-1"]',
      )!,
    );

    await waitFor(() => {
      expect(mocks.updateSettings).toHaveBeenCalledWith({
        selectedModel: { provider: "xai", name: "grok-code-fast-1" },
        recentModels: [
          { provider: "xai", name: "grok-code-fast-1" },
          { provider: "openai", name: "deleted-model" },
          { provider: "openai", name: "gpt-5" },
          { provider: "openai", name: "gpt-5-mini" },
          { provider: "google", name: "gemini-2.5-pro" },
        ],
      });
    });
  });

  it("normalizes legacy custom recents without duplicating them", async () => {
    mocks.renderSubContent = true;
    mocks.settings.selectedModel = {
      provider: "custom",
      name: "shared-model",
    };
    mocks.settings.recentModels = [
      { provider: "custom", name: "shared-model" },
      { provider: "openrouter", name: "openrouter/free" },
    ];

    render(<ModelPicker />);
    const customARow = screen.getAllByLabelText(/Custom A.*Selected/)[0];
    const customBRow = screen.getAllByLabelText(/^Custom B/)[0];
    expect(customBRow.getAttribute("aria-label")).not.toContain("Selected");
    fireEvent.click(customARow);

    await waitFor(() => {
      expect(mocks.updateSettings).toHaveBeenCalledWith({
        selectedModel: {
          provider: "custom",
          name: "shared-model",
          customModelId: 1,
        },
        recentModels: [
          {
            provider: "custom",
            name: "shared-model",
            customModelId: 1,
          },
          { provider: "openrouter", name: "openrouter/free" },
        ],
      });
    });
  });

  it("keeps hook order stable while settings load", () => {
    mocks.settingsAvailable = false;
    const { rerender } = render(<ModelPicker />);

    mocks.settingsAvailable = true;
    expect(() => rerender(<ModelPicker />)).not.toThrow();
    expect(screen.getByTestId("model-picker")).toBeTruthy();
  });

  it("labels a legacy Dyad selection instead of resurrecting the model", () => {
    mocks.settings.selectedModel = { provider: "auto", name: "auto" };

    render(<ModelPicker />);

    expect(screen.getByTestId("model-picker").textContent).toContain(
      "Select a model",
    );
  });

  it("keeps custom model ids ending in /free visible for Pro users", () => {
    mocks.settings.recentModels = [
      { provider: "custom", name: "team/free", customModelId: 3 },
    ];
    mocks.renderSubContent = true;

    render(<ModelPicker />);

    expect(screen.getAllByText("Custom Free")).toHaveLength(2);
    for (const row of document.querySelectorAll(
      '[data-model-provider="custom"][data-model-name="team/free"]',
    )) {
      expect(row.getAttribute("aria-label")).not.toContain("Data sharing");
      expect(within(row as HTMLElement).queryByText("Data sharing")).toBeNull();
    }
  });

  it("filters hidden Pro models out of Recent", () => {
    mocks.settings.recentModels = [
      { provider: "openrouter", name: "openrouter/free" },
    ];

    render(<ModelPicker />);

    expect(screen.queryByText("Recent")).toBeNull();
    expect(screen.queryByText("Free (OpenRouter)")).toBeNull();
  });

  it("uses custom model ids for Recent keys and selection", () => {
    mocks.settings.selectedModel = {
      provider: "custom",
      name: "shared-model",
      customModelId: 2,
    };
    mocks.settings.recentModels = [
      { provider: "custom", name: "shared-model", customModelId: 1 },
      { provider: "custom", name: "shared-model", customModelId: 2 },
    ];

    render(<ModelPicker />);

    const recentRows = Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        'button[data-model-provider="custom"][data-model-name="shared-model"]',
      ),
    );
    expect(recentRows).toHaveLength(2);
    expect(recentRows[0].getAttribute("aria-label")).not.toContain("Selected");
    expect(recentRows[1].getAttribute("aria-label")).toContain("Selected");
  });

  it("reserves recent local model rows while local catalogs load", () => {
    mocks.settings.recentModels = [
      { provider: "ollama", name: "qwen3-coder:30b" },
    ];

    render(<ModelPicker />);

    expect(screen.getByText("Recent")).toBeTruthy();
    expect(screen.getByText("qwen3-coder:30b")).toBeTruthy();
    expect(screen.getByText("Loading...")).toBeTruthy();
  });

  it("resolves recent local rows independently by provider", async () => {
    let resolveOllama: (() => void) | undefined;
    mocks.loadOllamaModels.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveOllama = resolve;
        }),
    );
    mocks.loadLMStudioModels.mockImplementationOnce(
      () => new Promise<void>(() => undefined),
    );
    mocks.settings.recentModels = [
      { provider: "ollama", name: "missing-ollama" },
      { provider: "lmstudio", name: "missing-lmstudio" },
    ];

    render(<ModelPicker />);
    act(() => mocks.dropdownOpenChange?.(true));
    expect(screen.getAllByText("Loading...")).toHaveLength(2);

    await act(async () => resolveOllama?.());

    await waitFor(() => {
      expect(screen.queryByText("missing-ollama")).toBeNull();
      expect(screen.getByText("missing-lmstudio")).toBeTruthy();
      expect(screen.getAllByText("Loading...")).toHaveLength(1);
    });
  });

  it("does not show providers on pending Recent local model rows", () => {
    mocks.settings.recentModels = [
      { provider: "ollama", name: "shared-model" },
      { provider: "lmstudio", name: "shared-model" },
    ];

    render(<ModelPicker />);

    const rows = screen.getAllByLabelText("shared-model. Loading local model");
    expect(rows).toHaveLength(2);
    expect(screen.queryByText("Ollama")).toBeNull();
    expect(screen.queryByText("LM Studio")).toBeNull();
  });

  it("hides cached local recents after the provider refresh fails", () => {
    mocks.ollamaModels = [
      {
        provider: "ollama",
        modelName: "qwen3-coder:30b",
        displayName: "Qwen3 Coder 30B",
      },
    ];
    mocks.ollamaError = new Error("Ollama unavailable");
    mocks.settings.recentModels = [
      { provider: "ollama", name: "qwen3-coder:30b" },
    ];

    render(<ModelPicker />);

    expect(screen.queryByText("Recent")).toBeNull();
    expect(screen.queryByText("Qwen3 Coder 30B")).toBeNull();
  });

  it("does not show providers on ambiguous Recent local model rows", () => {
    mocks.ollamaModels = [
      {
        provider: "ollama",
        modelName: "shared-model",
        displayName: "Shared Local",
      },
    ];
    mocks.lmStudioModels = [
      {
        provider: "lmstudio",
        modelName: "shared-model",
        displayName: "Shared Local",
      },
    ];
    mocks.settings.recentModels = [
      { provider: "ollama", name: "shared-model" },
      { provider: "lmstudio", name: "shared-model" },
    ];

    render(<ModelPicker />);

    const rows = screen.getAllByLabelText(/^Shared Local\. Effort:/);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(within(row).getByText("shared-model")).toBeTruthy();
      expect(row.getAttribute("aria-label")).not.toMatch(/Ollama|LM Studio/);
    }
  });

  it("keeps local models reachable while the cloud catalog loads", () => {
    mocks.catalogLoading = true;
    mocks.renderSubContent = true;

    render(<ModelPicker />);

    expect(screen.getAllByText("All models").length).toBeGreaterThan(0);
    expect(screen.getByText("Local providers")).toBeTruthy();
    expect(screen.getByText("Ollama")).toBeTruthy();
    expect(screen.getByText("LM Studio")).toBeTruthy();
    expect(screen.getByText("Loading cloud models...")).toBeTruthy();
  });

  it("shows a cloud catalog error without hiding local models", () => {
    mocks.catalogUnavailable = true;
    mocks.catalogError = new Error("catalog unavailable");
    mocks.renderSubContent = true;

    render(<ModelPicker />);

    expect(
      screen.getAllByText("Couldn’t load cloud models").length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("Local providers")).toBeTruthy();
    expect(screen.getByText("Ollama")).toBeTruthy();
    expect(screen.getByText("LM Studio")).toBeTruthy();
  });

  it("does not leave a trailing separator after Recent", () => {
    mocks.settings.recentModels = [{ provider: "openai", name: "gpt-5" }];

    render(<ModelPicker />);

    const recentRow = document.querySelector(
      '[data-model-provider="openai"][data-model-name="gpt-5"]',
    );
    expect(recentRow).not.toBeNull();
    expect(recentRow?.nextElementSibling?.getAttribute("data-slot")).not.toBe(
      "dropdown-menu-separator",
    );
  });

  it("lists Ollama and LM Studio directly under Local providers", () => {
    mocks.renderSubContent = true;

    render(<ModelPicker />);

    const allModelsMenu = screen.getByTestId("more-models-submenu");
    const localProviders = within(allModelsMenu).getByText("Local providers");
    const otherProviders = within(allModelsMenu).getByText("Other providers");
    expect(
      localProviders.compareDocumentPosition(otherProviders) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(allModelsMenu).getByText("Ollama")).toBeTruthy();
    expect(within(allModelsMenu).getByText("LM Studio")).toBeTruthy();
    expect(screen.queryByText("Local models")).toBeNull();
  });

  it("opens nested navigation submenus on hover with forgiving pointer timing", () => {
    mocks.renderSubContent = true;

    render(<ModelPicker />);

    const getTrigger = (label: string) =>
      screen
        .getAllByText(label)
        .map((element) => element.closest("button"))
        .find((element): element is HTMLButtonElement => element !== null)!;

    for (const label of [
      "All models",
      "Google Vertex AI",
      "Ollama",
      "LM Studio",
    ]) {
      const trigger = getTrigger(label);
      expect(trigger.dataset.openOnHover).toBe("true");
      expect(trigger.dataset.hoverDelay).toBe("120");
      expect(trigger.dataset.closeDelay).toBe("100");
    }

    expect(getTrigger("Google Vertex AI").getAttribute("aria-label")).toBe(
      "Google Vertex AI. 1 model. Opens submenu",
    );
    expect(getTrigger("Ollama").getAttribute("aria-label")).toBe(
      "Ollama. None available. Opens submenu",
    );

    expect(
      screen.getByText("GPT 5").closest("button")?.dataset.openOnHover,
    ).toBeUndefined();
  });

  it("gives model-list menus room while keeping model metadata separate", () => {
    mocks.renderSubContent = true;

    render(<ModelPicker />);

    expect(screen.getByTestId("more-models-submenu").className).toContain(
      "w-[min(20rem,calc(100vw-1.5rem))]",
    );

    const modelName = screen.getAllByText("GPT 5")[0];
    expect(modelName.className).toContain("block max-w-full truncate");
    expect(modelName.getAttribute("title")).toBeNull();
    expect(modelName.closest("button")?.firstElementChild?.className).toContain(
      "grid-cols-[minmax(0,1fr)_auto]",
    );
  });

  it("collapses providers that still need setup behind Other providers", () => {
    mocks.renderSubContent = true;

    render(<ModelPicker />);

    expect(screen.getByText("Other providers")).toBeTruthy();
    // Nothing is set up in this fixture, so the ready list stays empty and the
    // catalog offers a hint instead.
    expect(screen.getByText("Ready to use")).toBeTruthy();
    expect(
      screen.getByText(/Add an API key under Model Providers/),
    ).toBeTruthy();
    const vertexModels = screen.getByTestId("other-provider-models-vertex");
    expect(
      within(vertexModels).getByText("Vertex Gemini 2.5 Pro"),
    ).toBeTruthy();
    expect(screen.getAllByText("Vertex Gemini 2.5 Pro")).toHaveLength(1);
  });

  it("omits effort from the trigger and selects catalog-defined effort from a model submenu", async () => {
    mocks.renderSubContent = true;
    render(<ModelPicker />);

    expect(screen.getByTestId("model-picker").textContent).toContain(
      "GPT 5 Mini",
    );
    expect(screen.getByTestId("model-picker").textContent).not.toContain(
      "Medium",
    );
    expect(screen.getByTestId("model-picker").className).toContain(
      "max-w-[220px]",
    );
    expect(screen.getByTestId("model-picker-dropdown").className).toContain(
      "w-[min(20rem,calc(100vw-1.5rem))]",
    );
    const gpt5Row = screen.getAllByText("GPT 5")[0].closest("button")!;
    expect(
      gpt5Row.querySelector("[data-effort-chevron]")?.previousElementSibling
        ?.textContent,
    ).toBe("Min");
    expect(gpt5Row.getAttribute("aria-label")).toContain("Effort: Minimal");
    expect(
      gpt5Row.querySelector("[data-effort-level]")?.getAttribute("title"),
    ).toBeNull();
    fireEvent.click(gpt5Row.querySelector("[data-effort-chevron]")!);
    fireEvent.click(screen.getAllByText("Xhigh")[0]);

    await waitFor(() => {
      expect(mocks.updateSettings).toHaveBeenCalledWith({
        selectedModel: { name: "gpt-5", provider: "openai" },
        recentModels: [{ name: "gpt-5", provider: "openai" }],
        modelEffortPreferences: {
          '["openai","gpt-5",null]': "xhigh",
        },
      });
    });
  });

  it("offers and persists None effort for Ollama models", async () => {
    mocks.ollamaModels = [
      {
        provider: "ollama",
        modelName: "qwen3-coder:30b",
        displayName: "Qwen3 Coder 30B",
      },
    ];
    mocks.renderSubContent = true;

    render(<ModelPicker />);

    const qwenRow = screen.getByText("Qwen3 Coder 30B").closest("button")!;
    expect(qwenRow.getAttribute("aria-label")).toContain("Effort: Medium");
    fireEvent.click(screen.getByText("None"));

    await waitFor(() => {
      expect(mocks.updateSettings).toHaveBeenCalledWith({
        selectedModel: {
          name: "qwen3-coder:30b",
          provider: "ollama",
        },
        recentModels: [
          {
            name: "qwen3-coder:30b",
            provider: "ollama",
          },
        ],
        modelEffortPreferences: {
          '["ollama","qwen3-coder:30b",null]': "none",
        },
      });
    });
  });

  it("only opens the effort submenu from its chevron", () => {
    mocks.renderSubContent = true;
    render(<ModelPicker />);

    const gpt5Row = screen.getByText("GPT 5").closest("button")!;
    fireEvent.mouseDown(gpt5Row);
    expect(mocks.preventBaseUIHandler).toHaveBeenCalledTimes(1);

    fireEvent.mouseDown(gpt5Row.querySelector("[data-effort-chevron]")!);
    expect(mocks.preventBaseUIHandler).toHaveBeenCalledTimes(1);
  });

  it("disables selection while an existing chat is still loading", () => {
    mocks.pathname = "/chat";
    mocks.search = { id: 42 };
    mocks.chatLoading = true;

    render(<ModelPicker />);

    expect(
      (screen.getByTestId("model-picker") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(mocks.updateSettings).not.toHaveBeenCalled();
    expect(mocks.updateChat).not.toHaveBeenCalled();
  });

  it("persists an established chat model through the optimistic mutation", async () => {
    mocks.pathname = "/chat";
    mocks.search = { id: 42 };
    mocks.chat = {
      id: 42,
      messages: [{ id: 1 }],
      modelSelection: {
        provider: "auto",
        name: "auto",
        effortLevel: "medium",
      },
    };
    mocks.renderSubContent = true;

    render(<ModelPicker />);
    fireEvent.click(screen.getAllByText("Xhigh")[0]);

    await waitFor(() => {
      expect(mocks.setChatSelection).toHaveBeenCalledWith({
        modelSelection: {
          provider: "openai",
          name: "gpt-5",
          effortLevel: "xhigh",
        },
      });
    });
    expect(mocks.updateSettings).toHaveBeenCalledWith({
      modelEffortPreferences: {
        '["openai","gpt-5",null]': "xhigh",
      },
      recentModels: [{ name: "gpt-5", provider: "openai" }],
    });
    expect(mocks.updateChat).not.toHaveBeenCalled();
  });

  it("selects a subscription-eligible model in an existing chat without replacing its history", async () => {
    mocks.renderSubContent = true;
    mocks.pathname = "/chat";
    mocks.search = { id: 42 };
    mocks.chat = {
      id: 42,
      messages: [{ id: 1 }],
      modelSelection: { provider: "auto", name: "auto", effortLevel: "medium" },
    };
    render(<ModelPicker />);
    fireEvent.click(screen.getAllByText("GPT 5")[0]);
    await waitFor(() =>
      expect(mocks.setChatSelection).toHaveBeenCalledWith({
        modelSelection: expect.objectContaining({
          provider: "openai",
          name: "gpt-5",
        }),
      }),
    );
    expect(mocks.chat.messages).toEqual([{ id: 1 }]);
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "replaces price with ChatGPT plan for subscription models (selected: %s)",
    (selected) => {
      mocks.renderSubContent = true;
      if (selected) {
        mocks.settings.selectedModel = { provider: "openai", name: "gpt-5" };
      }
      render(<ModelPicker />);

      const row = screen.getAllByRole("button", {
        name: /^GPT 5\. ChatGPT plan\./,
      })[0];
      expect(within(row).getByText("ChatGPT plan")).toBeTruthy();
      expect(within(row).queryByTestId("price-badge")).toBeNull();
      expect(row.getAttribute("aria-label")).toContain("ChatGPT plan");
      expect(row.getAttribute("aria-label")).not.toContain("Price:");
    },
  );

  it.each(["disconnected", "pro"])(
    "keeps the price badge when subscription usage is %s",
    (mode) => {
      mocks.renderSubContent = true;
      if (mode === "disconnected") mocks.subscriptionConnected = false;
      else mocks.settings.proModelUsage = "pro";
      render(<ModelPicker />);

      const row = screen.getAllByText("GPT 5")[0].closest("button")!;
      expect(within(row).queryByText("ChatGPT plan")).toBeNull();
      expect(within(row).getByTestId("price-badge")).toBeTruthy();
      expect(row.getAttribute("aria-label")).toContain("Price:");
    },
  );

  it("lists models from providers that are already set up under Ready to use", () => {
    mocks.renderSubContent = true;
    mocks.settings.providerSettings.openrouter.apiKey.value = "openrouter-key";

    render(<ModelPicker />);

    const readyLabel = screen.getByText("Ready to use");
    const claudeRow = screen.getByText("Claude Sonnet 4.5").closest("button")!;
    const otherLabel = screen.getByText("Other providers");
    expect(
      readyLabel.compareDocumentPosition(claudeRow) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      claudeRow.compareDocumentPosition(otherLabel) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("selects a model from a provider with its own key", () => {
    mocks.settings.providerSettings.openrouter.apiKey.value = "openrouter-key";
    mocks.renderSubContent = true;

    render(<ModelPicker />);

    fireEvent.click(screen.getByText("Claude Sonnet 4.5").closest("button")!);

    expect(mocks.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedModel: expect.objectContaining({
          name: "anthropic/claude-sonnet-4.5",
          provider: "openrouter",
        }),
        recentModels: [
          {
            name: "anthropic/claude-sonnet-4.5",
            provider: "openrouter",
          },
        ],
      }),
    );
  });

  it("hides the free OpenRouter fallback once a provider is set up", () => {
    mocks.renderSubContent = true;
    mocks.settings.providerSettings.openrouter.apiKey.value = "openrouter-key";

    render(<ModelPicker />);

    // The free fallback only matters without a key; here the paid model is the
    // one offered.
    expect(screen.queryByText("Free (OpenRouter)")).toBeNull();
    expect(screen.getAllByText("Claude Sonnet 4.5").length).toBe(1);
  });

  it("selects flat Pro models with their source provider", async () => {
    mocks.renderSubContent = true;
    render(<ModelPicker />);

    fireEvent.click(screen.getByText("GPT 5").closest("button")!);

    expect(mocks.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedModel: expect.objectContaining({
          name: "gpt-5",
          provider: "openai",
        }),
        recentModels: [{ name: "gpt-5", provider: "openai" }],
      }),
    );
    await waitFor(() => {
      expect(mocks.invalidateQueries).toHaveBeenCalledTimes(1);
    });
  });

  it("updates an established chat model through the chat selection", async () => {
    mocks.renderSubContent = true;
    mocks.pathname = "/chat";
    mocks.search = { id: 42 };
    mocks.chat = {
      id: 42,
      messages: [{ id: 1 }],
      modelSelection: {
        provider: "openai",
        name: "gpt-5-mini",
        effortLevel: "medium",
      },
    };

    render(<ModelPicker />);
    fireEvent.click(screen.getByText("GPT 5").closest("button")!);

    await waitFor(() => {
      expect(mocks.setChatSelection).toHaveBeenCalledWith({
        modelSelection: expect.objectContaining({
          name: "gpt-5",
          provider: "openai",
        }),
      });
    });
    expect(mocks.setChatMode).not.toHaveBeenCalled();
    expect(mocks.setChatModelSelection).not.toHaveBeenCalled();
  });
});
