import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ipc, type DiscoveredModel } from "@/ipc/types";
import { useMutation } from "@tanstack/react-query";
import { Loader2Icon, RefreshCwIcon } from "lucide-react";
import { showError, showSuccess } from "@/lib/toast";

interface CreateCustomModelDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  providerId: string;
  /** 该 Provider 已有的模型 API 名，用于在远端列表中过滤掉重复项。 */
  existingModelApiNames?: string[];
}

export function CreateCustomModelDialog({
  isOpen,
  onClose,
  onSuccess,
  providerId,
  existingModelApiNames,
}: CreateCustomModelDialogProps) {
  const [apiName, setApiName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [maxOutputTokens, setMaxOutputTokens] = useState<string>("");
  const [contextWindow, setContextWindow] = useState<string>("");
  const [discoveredModels, setDiscoveredModels] = useState<
    DiscoveredModel[] | null
  >(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const params = {
        apiName,
        displayName,
        providerId,
        description: description || undefined,
        maxOutputTokens: maxOutputTokens
          ? parseInt(maxOutputTokens, 10)
          : undefined,
        contextWindow: contextWindow ? parseInt(contextWindow, 10) : undefined,
      };

      if (!params.apiName) throw new Error("Model API name is required");
      if (!params.displayName)
        throw new Error("Model display name is required");
      if (maxOutputTokens && isNaN(params.maxOutputTokens ?? NaN))
        throw new Error("Max Output Tokens must be a valid number");
      if (contextWindow && isNaN(params.contextWindow ?? NaN))
        throw new Error("Context Window must be a valid number");

      await ipc.languageModel.createCustomModel({
        providerId: params.providerId,
        displayName: params.displayName,
        apiName: params.apiName,
        description: params.description,
        maxOutputTokens: params.maxOutputTokens,
        contextWindow: params.contextWindow,
      });
    },
    onSuccess: () => {
      showSuccess("Custom model created successfully!");
      resetForm();
      onSuccess(); // Refetch or update UI
      onClose();
    },
    onError: (error) => {
      showError(error);
    },
  });

  /**
   * 用该 Provider 已保存的 Base URL 与 API Key 拉取远端 `/models`，
   * 让用户从真实可用的模型中挑选，而不是手工输入模型 ID。
   */
  const discoveryMutation = useMutation({
    mutationFn: async () =>
      ipc.languageModel.listCustomProviderModels({ providerId }),
    onSuccess: (result) => {
      setDiscoveredModels(result.models);
      setDiscoveryError(null);
    },
    onError: (error) => {
      setDiscoveredModels(null);
      setDiscoveryError(
        error instanceof Error
          ? error.message
          : "Failed to fetch the model list.",
      );
    },
  });

  /** 选中远端模型后回填 Model ID，并补齐仍为空的显示名。 */
  const handleSelectDiscoveredModel = (modelId: string) => {
    setApiName(modelId);
    setDisplayName((current) => current.trim() || modelId);
  };

  // 远端列表中剔除已添加过的模型，避免同一个 API 名被重复添加。
  const existingApiNames = new Set(existingModelApiNames ?? []);
  const selectableModels = (discoveredModels ?? []).filter(
    (model) => !existingApiNames.has(model.id),
  );

  const resetForm = () => {
    setApiName("");
    setDisplayName("");
    setDescription("");
    setMaxOutputTokens("");
    setContextWindow("");
    setDiscoveredModels(null);
    setDiscoveryError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  const handleClose = () => {
    if (!mutation.isPending) {
      resetForm();
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>Add Custom Model</DialogTitle>
          <DialogDescription>
            Configure a new language model for the selected provider.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-start gap-4">
              <Label className="pt-2 text-right">From provider</Label>
              <div className="col-span-3 space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => discoveryMutation.mutate()}
                  disabled={mutation.isPending || discoveryMutation.isPending}
                >
                  {discoveryMutation.isPending ? (
                    <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCwIcon className="mr-2 h-4 w-4" />
                  )}
                  {discoveryMutation.isPending
                    ? "Fetching models..."
                    : "Fetch model list"}
                </Button>
                {selectableModels.length > 0 && (
                  <Select
                    value={apiName}
                    onValueChange={(value) =>
                      value && handleSelectDiscoveredModel(value)
                    }
                    disabled={mutation.isPending}
                  >
                    <SelectTrigger
                      className="w-full"
                      aria-label="Select a model from the provider"
                    >
                      <SelectValue placeholder="Select a model" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectableModels.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.id}
                          {model.ownedBy ? ` · ${model.ownedBy}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {discoveryError && (
                  <p className="text-xs text-red-500">{discoveryError}</p>
                )}
                {!discoveryError && discoveredModels === null && (
                  <p className="text-xs text-muted-foreground">
                    Lists models from this provider&apos;s <code>/models</code>{" "}
                    endpoint using its saved API key, then fills in the model ID
                    for you.
                  </p>
                )}
                {!discoveryError && discoveredModels !== null && (
                  <p className="text-xs text-muted-foreground">
                    {discoveredModels.length === 0
                      ? "The provider returned no models."
                      : selectableModels.length === 0
                        ? `All ${discoveredModels.length} discovered model(s) are already added.`
                        : `${selectableModels.length} model(s) available` +
                          (discoveredModels.length > selectableModels.length
                            ? ` · ${discoveredModels.length - selectableModels.length} already added`
                            : "")}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="model-id" className="text-right">
                Model ID*
              </Label>
              <Input
                id="model-id"
                value={apiName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setApiName(e.target.value)
                }
                className="col-span-3"
                placeholder="This must match the model expected by the API"
                required
                disabled={mutation.isPending}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="model-name" className="text-right">
                Name*
              </Label>
              <Input
                id="model-name"
                value={displayName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setDisplayName(e.target.value)
                }
                className="col-span-3"
                placeholder="Human-friendly name for the model"
                required
                disabled={mutation.isPending}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="description" className="text-right">
                Description
              </Label>
              <Input
                id="description"
                value={description}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setDescription(e.target.value)
                }
                className="col-span-3"
                placeholder="Optional: Describe the model's capabilities"
                disabled={mutation.isPending}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="max-output-tokens" className="text-right">
                Max Output Tokens
              </Label>
              <Input
                id="max-output-tokens"
                type="number"
                value={maxOutputTokens}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setMaxOutputTokens(e.target.value)
                }
                className="col-span-3"
                placeholder="Optional: e.g., 4096"
                disabled={mutation.isPending}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="context-window" className="text-right">
                Context Window
              </Label>
              <Input
                id="context-window"
                type="number"
                value={contextWindow}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setContextWindow(e.target.value)
                }
                className="col-span-3"
                placeholder="Optional: e.g., 8192"
                disabled={mutation.isPending}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Adding..." : "Add Model"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
