import { type ImageThemeMode } from "../types/image_generation";
import { assertNoActiveRecording } from "./recording_registry";
import log from "electron-log";
import { DyadError, DyadErrorKind } from "@/errors/dyad_error";

const logger = log.scope("image_generation_service");

/** Named once: the early refusal and the save-time refusal must read alike. */
const IMAGE_SAVE_ACTION = "save a generated image";

export interface GenerateImageInput {
  requestId: string;
  prompt: string;
  themeMode: ImageThemeMode;
  targetAppId: number;
}

interface ActiveGeneration {
  controller: AbortController;
  targetAppId: number;
  settlement: Promise<unknown>;
}

export class ImageGenerationService {
  private readonly active = new Map<string, ActiveGeneration>();
  private readonly cancellationTombstones = new Set<string>();
  private readonly deletionFences = new Map<number, number>();
  private resetFenceCount = 0;

  generate(params: GenerateImageInput) {
    this.assertAcceptingGenerations(params.targetAppId);
    // Before the recording refusal below: a cancellation that arrived first is
    // what happened to this request, and reporting it as blocked by a recording
    // would both misname it and leave its tombstone behind until eviction.
    if (this.cancellationTombstones.delete(params.requestId)) {
      throw new DyadError(
        "Image generation cancelled.",
        DyadErrorKind.UserCancelled,
      );
    }
    // Refuse before the generation, not just before the save: the save runs
    // behind a recording's session-long `repository` claim, and the user would
    // otherwise pay for and wait through a full generation to be told so.
    // The coordinator repeats this check atomically for a recording that
    // starts mid-generation; this one is only the early exit.
    assertNoActiveRecording(params.targetAppId, IMAGE_SAVE_ACTION);
    if (this.active.has(params.requestId)) {
      throw new DyadError(
        "Image generation invocation is already active",
        DyadErrorKind.Conflict,
      );
    }
    const controller = new AbortController();
    const settlement = this.execute(params, controller).finally(() => {
      if (this.active.get(params.requestId)?.settlement === settlement) {
        this.active.delete(params.requestId);
      }
    });
    this.active.set(params.requestId, {
      controller,
      targetAppId: params.targetAppId,
      settlement,
    });
    return settlement;
  }

  beginAppDeletion(appId: number): void {
    this.deletionFences.set(appId, (this.deletionFences.get(appId) ?? 0) + 1);
  }

  endAppDeletion(appId: number): void {
    const remaining = (this.deletionFences.get(appId) ?? 1) - 1;
    if (remaining > 0) this.deletionFences.set(appId, remaining);
    else this.deletionFences.delete(appId);
  }

  beginReset(): void {
    this.resetFenceCount += 1;
  }

  endReset(): void {
    this.resetFenceCount = Math.max(0, this.resetFenceCount - 1);
  }

  assertAcceptingGenerations(appId: number): void {
    if (this.resetFenceCount > 0 || this.deletionFences.has(appId)) {
      throw new DyadError(
        "The app is being deleted",
        DyadErrorKind.Precondition,
      );
    }
  }

  private async execute(
    _params: GenerateImageInput,
    _controller: AbortController,
  ): Promise<never> {
    // Image generation was only ever provided by the Dyad cloud engine,
    // which this build does not contact.
    throw new DyadError(
      "Image generation is unavailable in this build.",
      DyadErrorKind.Precondition,
    );
  }

  cancel(
    requestId: string,
    options: { readonly retainIfMissing?: boolean } = {},
  ): boolean {
    const active = this.active.get(requestId);
    if (!active) {
      if (!options.retainIfMissing) return false;
      if (this.cancellationTombstones.size >= 128) {
        const oldest = this.cancellationTombstones.values().next().value;
        if (oldest) this.cancellationTombstones.delete(oldest);
      }
      this.cancellationTombstones.add(requestId);
      return true;
    }
    active.controller.abort();
    logger.log(`Image generation cancellation requested: ${requestId}`);
    return true;
  }

  async cancelAndSettleApp(appId: number, timeoutMs = 1_000): Promise<void> {
    const matching = [...this.active.entries()].filter(
      ([, active]) => active.targetAppId === appId,
    );
    for (const [, active] of matching) active.controller.abort();
    await boundedSettle(
      matching.map(([, active]) => active.settlement),
      timeoutMs,
    );
  }

  async cancelAndSettleAll(timeoutMs = 1_000): Promise<void> {
    const active = [...this.active.values()];
    for (const entry of active) entry.controller.abort();
    await boundedSettle(
      active.map((entry) => entry.settlement),
      timeoutMs,
    );
    this.cancellationTombstones.clear();
  }

  inspectOwnedResources(): {
    readonly active: number;
    readonly cancellationTombstones: number;
  } {
    return {
      active: this.active.size,
      cancellationTombstones: this.cancellationTombstones.size,
    };
  }
}

async function boundedSettle(
  settlements: readonly Promise<unknown>[],
  timeoutMs: number,
): Promise<void> {
  if (settlements.length === 0) return;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    Promise.allSettled(settlements),
    new Promise<void>((resolve) => {
      timeout = setTimeout(resolve, timeoutMs);
    }),
  ]);
  if (timeout) clearTimeout(timeout);
}

export const imageGenerationService = new ImageGenerationService();
