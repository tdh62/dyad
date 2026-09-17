import { useSubscriptionAccount } from "@/hooks/useSubscriptionAccount";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Sparkles } from "lucide-react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { useSettings } from "@/hooks/useSettings";
import { hasDyadProKey } from "@/lib/schemas";

export function ProModeSelector() {
  const { settings, updateSettings } = useSettings();
  const subscription = useSubscriptionAccount();

  const hasProKey = settings ? hasDyadProKey(settings) : false;

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger className="inline-flex items-center justify-center whitespace-nowrap rounded-lg text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border-none bg-transparent shadow-none text-primary/95 hover:text-primary hover:bg-primary/10 h-7 px-2 gap-1 cursor-pointer" />
          }
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span className="font-medium">Pro</span>
        </TooltipTrigger>
        <TooltipContent>Configure Dyad Pro settings</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-80 border-primary/20">
        <div className="space-y-4">
          <div className="space-y-1">
            <h4 className="font-medium flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-primary font-medium">Dyad Pro</span>
            </h4>
            <div className="h-px bg-gradient-to-r from-primary/50 via-primary/20 to-transparent" />
          </div>
          {hasProKey && (
            <div className="space-y-2">
              <Label>Model usage</Label>
              <ToggleGroup
                aria-label="Model usage"
                variant="outline"
                size="sm"
                className="w-full"
                value={[
                  subscription.data?.connected &&
                  settings?.proModelUsage !== "pro"
                    ? "subscription"
                    : "pro",
                ]}
                onValueChange={(value) => {
                  if (
                    value[0] === "pro" ||
                    (value[0] === "subscription" &&
                      subscription.data?.connected)
                  )
                    void updateSettings({
                      proModelUsage: value[0] as "pro" | "subscription",
                    });
                }}
              >
                <ToggleGroupItem
                  value="subscription"
                  disabled={!subscription.data?.connected}
                  className="text-xs"
                >
                  ChatGPT Subscription
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="pro"
                  className="text-xs"
                  onClick={() => {
                    // Disconnected accounts display Pro even when the saved
                    // preference still requires subscription credentials.
                    // Clicking that selected toggle emits an empty value.
                    if (
                      !subscription.data?.connected &&
                      settings?.proModelUsage !== "pro"
                    )
                      void updateSettings({ proModelUsage: "pro" });
                  }}
                >
                  Pro credits
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
