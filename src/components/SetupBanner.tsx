import { useTranslation } from "react-i18next";
import { CircleCheck, ChevronRight, Play, Settings } from "lucide-react";
import { useFirstPromptSaga } from "@/first_prompt/FirstPromptProvider";
import { SECTION_IDS } from "@/lib/settingsSearchIndex";

import { ipc } from "@/ipc/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLanguageModelProviders } from "@/hooks/useLanguageModelProviders";
import { useScrollAndNavigateTo } from "@/hooks/useScrollAndNavigateTo";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSubscriptionAccount } from "@/hooks/useSubscriptionAccount";
import { useSettings } from "@/hooks/useSettings";
import { isDyadProEnabled } from "@/lib/schemas";
import { queryKeys } from "@/lib/queryKeys";
import { ProviderIcon } from "./ProviderIcon";

export function SetupBanner({
  variant = "inline",
  forceShow = false,
}: {
  variant?: "inline" | "dialog";
  forceShow?: boolean;
}) {
  const { t } = useTranslation("home");
  const client = useQueryClient();
  const subscription = useSubscriptionAccount();
  const { settings } = useSettings();
  const hasPro = settings && isDyadProEnabled(settings);
  const connection = useMutation({
    mutationFn: (cancel: boolean) =>
      cancel
        ? ipc.settings.disconnectCodexSubscription()
        : ipc.settings.connectCodexSubscription({
            acceptCharges: true,
            selectModel: !hasPro,
          }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: queryKeys.settings.all });
    },
  });
  const { hasArmedPayload: hasPendingPrompt } = useFirstPromptSaga();
  const { isAnyProviderSetup, isLoading: loading } =
    useLanguageModelProviders();

  const settingsScrollAndNavigateTo = useScrollAndNavigateTo("/settings", {
    behavior: "smooth",
    block: "start",
  });

  const handleSubscriptionSetupClick = () => {
    connection.mutate(false);
  };

  const handleOtherProvidersClick = () => {
    settingsScrollAndNavigateTo(SECTION_IDS.providers);
  };

  const hasProviderSetup = isAnyProviderSetup();

  const itemsNeedAction: string[] = [];
  if (!hasProviderSetup && !loading) {
    itemsNeedAction.push("ai-setup");
  }

  if (itemsNeedAction.length === 0 && !forceShow) {
    if (variant === "dialog") {
      return null;
    }

    return (
      <h1 className="text-center text-5xl font-bold mb-8 bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-gray-100 dark:to-gray-400 tracking-tight">
        {t("setup.buildNewApp")}
      </h1>
    );
  }

  return (
    <>
      <div
        className={cn(
          "w-full rounded-lg bg-background px-5 py-5",
          variant === "inline" && "mt-6 mb-6 border border-border shadow-sm",
        )}
      >
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            {hasProviderSetup
              ? "Manage AI setup"
              : variant === "dialog"
                ? "You're almost ready to build"
                : "Connect AI to start building"}
          </h2>
          {variant === "dialog" && hasPendingPrompt && !hasProviderSetup ? (
            <p className="mt-2 flex items-center justify-center gap-1.5 text-sm leading-6 text-muted-foreground">
              <CircleCheck
                aria-hidden="true"
                className="size-4 shrink-0 text-primary"
              />
              Your prompt is saved — it'll send as soon as you're connected.
            </p>
          ) : (
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {hasProviderSetup
                ? "Change how Dyad accesses AI."
                : "Dyad uses AI to build your app."}
            </p>
          )}
        </div>

        <div className="mt-5">
          <p className="mb-2 text-sm font-medium text-muted-foreground">
            Use your own subscription or API key
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <ProviderOptionButton
              label="ChatGPT subscription"
              chip={
                settings &&
                !hasPro &&
                subscription.data &&
                !subscription.data.pending
                  ? "Free"
                  : undefined
              }
              onClick={handleSubscriptionSetupClick}
              disabled={
                connection.isPending ||
                subscription.data?.pending ||
                !settings ||
                subscription.isLoading
              }
              icon={<ProviderIcon providerId="openai" className="size-4" />}
            />
            <ProviderOptionButton
              label="Other providers"
              onClick={handleOtherProvidersClick}
              icon={<Settings className="size-4 text-muted-foreground" />}
            />
          </div>
          {!settings && (
            <p className="mt-2 text-xs text-muted-foreground">
              Checking AI setup status…
            </p>
          )}
          {subscription.data?.pending && (
            <div className="mt-2 flex items-center justify-center gap-2">
              <p
                role="status"
                aria-live="polite"
                className="text-xs text-muted-foreground"
              >
                Waiting for ChatGPT sign-in in your browser…
              </p>
              <Button
                variant="ghost"
                size="sm"
                disabled={connection.isPending}
                onClick={() => connection.mutate(true)}
              >
                Cancel sign-in
              </Button>
            </div>
          )}
          {(connection.error ||
            subscription.error ||
            subscription.data?.error ||
            subscription.data?.setupError) && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {connection.error?.message ??
                subscription.error?.message ??
                subscription.data?.error ??
                subscription.data?.setupError}
            </p>
          )}
        </div>

        <div className="mt-4 flex w-full flex-col items-center justify-around gap-2 text-xs sm:flex-row">
          <button
            type="button"
            onClick={() => {
              ipc.system.openExternalUrl(
                "https://www.youtube.com/watch?v=rgdNoHLaRN4",
              );
            }}
            className="inline-flex cursor-pointer items-center gap-1.5 font-medium text-muted-foreground transition-colors hover:text-primary hover:underline"
          >
            <span className="inline-flex h-3.5 w-4 items-center justify-center rounded-[3px] bg-red-600 text-white">
              <Play
                aria-hidden="true"
                className="ml-0.5 size-2 fill-current stroke-current"
              />
            </span>
            Watch the walkthrough
          </button>
        </div>
      </div>
    </>
  );
}

function ProviderOptionButton({
  label,
  icon,
  chip,
  onClick,
  disabled,
}: {
  label: string;
  icon: React.ReactNode;
  chip?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-12 cursor-pointer items-center justify-between gap-2 rounded-md border border-border bg-(--background-lighter) px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 disabled:cursor-default disabled:opacity-50"
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-background">
          {icon}
        </span>
        <span>{label}</span>
      </span>
      {chip ? (
        <span className="shrink-0 rounded-full border border-emerald-600/25 bg-emerald-500/10 px-1.5 py-px text-[11px] font-semibold text-emerald-700 dark:border-emerald-400/25 dark:text-emerald-300">
          {chip}
        </span>
      ) : (
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      )}
    </button>
  );
}
