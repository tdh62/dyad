import { app } from "electron";
import { createTypedHandler } from "./base";
import { helpContracts } from "../types/help";
import { DyadError, DyadErrorKind } from "@/errors/dyad_error";

// In-memory session store for help bot conversations
type HelpMessage = { role: "user" | "assistant"; content: string };
const helpSessions = new Map<string, HelpMessage[]>();
const activeHelpStreams = new Map<string, AbortController>();

export function registerHelpBotHandlers() {
  // Abort in-flight help-bot streams and drop session history on quit.
  // (Guarded: `app` is undefined when this module is imported in unit tests.)
  app?.on?.("before-quit", () => {
    for (const controller of activeHelpStreams.values()) {
      controller.abort();
    }
    activeHelpStreams.clear();
    helpSessions.clear();
  });

  createTypedHandler(helpContracts.start, async () => {
    // 内网 / 离线版本：帮助机器人由 Dyad 云端（helpchat.dyad.sh）提供，已下线。
    throw new DyadError(
      "The help bot requires Dyad cloud services and is unavailable in this build.",
      DyadErrorKind.Precondition,
    );
  });

  createTypedHandler(helpContracts.cancel, async (_, sessionId) => {
    const controller = activeHelpStreams.get(sessionId);
    if (controller) {
      controller.abort();
      activeHelpStreams.delete(sessionId);
    }
    return { ok: true } as const;
  });
}
