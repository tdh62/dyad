import { ipc } from "@/ipc/types";
import { useFreeAgentQuota } from "@/hooks/useFreeAgentQuota";
import { useFreeModelQuota } from "@/hooks/useFreeModelQuota";
import { AI_STREAMING_ERROR_MESSAGE_PREFIX } from "@/shared/texts";
import {
  X,
  ExternalLink as ExternalLinkIcon,
  MessageSquarePlus,
  ArrowRight,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

export function ChatErrorBox({
  onDismiss,
  error,
  isDyadProEnabled,
  onStartNewChat,
  onSwitchToBuildMode,
}: {
  onDismiss: () => void;
  error: string;
  isDyadProEnabled: boolean;
  onStartNewChat?: () => void;
  onSwitchToBuildMode?: () => void;
}) {
  const fallbackPrefix = "Fallbacks=[{";
  const normalizedError = error.includes(fallbackPrefix)
    ? error.split(fallbackPrefix)[0]
    : error;
  const freeAgentQuotaError = parseFreeAgentQuotaError(normalizedError);
  const isFreeModelQuotaError =
    normalizedError.includes("dyad_free_model_quota_exceeded") ||
    normalizedError.includes("FREE_MODEL_QUOTA_EXCEEDED") ||
    normalizedError.includes("Dyad Free has reached its daily limit.") ||
    normalizedError.includes("Dyad Free limit");
  const { messagesLimit, resetTime } = useFreeAgentQuota();
  const {
    messagesLimit: freeModelMessagesLimit,
    resetTime: freeModelResetTime,
  } = useFreeModelQuota({ enabled: isFreeModelQuotaError });

  if (error.includes("doesn't have a free quota tier")) {
    return (
      <ChatErrorContainer onDismiss={onDismiss}>
        {error}
        <span className="ml-1">or switch to another model.</span>
      </ChatErrorContainer>
    );
  }

  // This is a very long list of model fallbacks that clutters the error message.
  //
  // We are matching "Fallbacks=[{" and not just "Fallbacks=" because the fallback
  // model itself can error and we want to include the fallback model error in the error message.
  // Example: https://github.com/dyad-sh/dyad/issues/1849#issuecomment-3590685911
  if (error.includes(fallbackPrefix)) {
    error = normalizedError;
  }
  // Handle FREE_AGENT_QUOTA_EXCEEDED error (Basic Agent mode quota exceeded)
  if (freeAgentQuotaError) {
    const authoritativeResetTime = freeAgentQuotaError.resetTime ?? resetTime;
    const resetText = authoritativeResetTime
      ? ` Your quota resets at ${new Intl.DateTimeFormat(undefined, {
          hour: "numeric",
          minute: "2-digit",
          timeZoneName: "short",
        }).format(new Date(authoritativeResetTime))}.`
      : "";

    return (
      <ChatErrorContainer onDismiss={onDismiss}>
        You have used all {messagesLimit} free Basic Agent messages for today.
        {resetText} This message was not sent.
        {onSwitchToBuildMode
          ? " You can switch this chat to Build mode and send it again."
          : " To use Build mode, first choose a model other than Dyad Free, then send it again."}
        {onSwitchToBuildMode && (
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onSwitchToBuildMode}
              className="gap-1.5"
            >
              Switch to Build
              <ArrowRight size={16} />
            </Button>
          </div>
        )}
      </ChatErrorContainer>
    );
  }

  if (isFreeModelQuotaError) {
    const resetText = freeModelResetTime
      ? ` Your quota resets at ${new Intl.DateTimeFormat(undefined, {
          hour: "numeric",
          minute: "2-digit",
          timeZoneName: "short",
        }).format(new Date(freeModelResetTime))}.`
      : "";

    return (
      <ChatErrorContainer onDismiss={onDismiss}>
        <span>
          You have reached the {freeModelMessagesLimit}-message Dyad Free model
          limit.
          {resetText} Switch to a model with your own provider API key to
          continue.
        </span>
      </ChatErrorContainer>
    );
  }

  return (
    <ChatErrorContainer onDismiss={onDismiss}>
      <div className="max-h-64 overflow-y-auto scrollbar-on-hover">
        <ErrorMarkdown>{error}</ErrorMarkdown>
      </div>
      <div className="mt-2 space-y-2 space-x-2">
        {isDyadProEnabled && onStartNewChat && (
          <Tooltip>
            <TooltipTrigger
              onClick={onStartNewChat}
              className="cursor-pointer inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium shadow-sm focus:outline-none focus:ring-2 bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500"
            >
              <span>Start new chat</span>
              <MessageSquarePlus size={18} />
            </TooltipTrigger>
            <TooltipContent>
              Starting a new chat can fix some issues
            </TooltipContent>
          </Tooltip>
        )}
        <ExternalLink href="https://www.dyad.sh/docs/faq">
          Read docs
        </ExternalLink>
      </div>
    </ChatErrorContainer>
  );
}

function parseFreeAgentQuotaError(
  error: string,
): { resetTime?: number | null } | null {
  try {
    const parsed: unknown = JSON.parse(error);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "type" in parsed &&
      parsed.type === "FREE_AGENT_QUOTA_EXCEEDED"
    ) {
      const resetTime = "resetTime" in parsed ? parsed.resetTime : undefined;
      return {
        resetTime:
          typeof resetTime === "number" && Number.isFinite(resetTime)
            ? resetTime
            : null,
      };
    }
  } catch {
    // Fall through to the legacy string marker check below.
  }
  return error.includes("FREE_AGENT_QUOTA_EXCEEDED") ? {} : null;
}

function ExternalLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const baseClasses =
    "cursor-pointer inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium shadow-sm focus:outline-none focus:ring-2";
  const secondaryClasses =
    "bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 hover:border-blue-300 focus:ring-blue-200";

  return (
    <a
      className={`${baseClasses} ${secondaryClasses}`}
      onClick={() => ipc.system.openExternalUrl(href)}
    >
      <span>{children}</span>
      <ExternalLinkIcon size={14} />
    </a>
  );
}

function ChatErrorContainer({
  onDismiss,
  children,
}: {
  onDismiss: () => void;
  children: React.ReactNode | string;
}) {
  return (
    <div
      data-testid="chat-error-box"
      className="relative mt-2 bg-red-50 border border-red-200 rounded-md shadow-sm p-2 mx-4"
    >
      <button
        onClick={onDismiss}
        className="absolute top-2.5 left-2 p-1 hover:bg-red-100 rounded"
      >
        <X size={14} className="text-red-500" />
      </button>
      <div className="pl-8 py-1 text-sm">
        <div className="text-red-700 text-wrap">
          {typeof children === "string" ? (
            <ErrorMarkdown>{children}</ErrorMarkdown>
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  );
}

function ErrorMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ children: linkChildren, ...props }) => (
          <a
            {...props}
            onClick={(e) => {
              e.preventDefault();
              if (props.href) {
                ipc.system.openExternalUrl(props.href);
              }
            }}
            className="text-blue-500 hover:text-blue-700"
          >
            {linkChildren}
          </a>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
