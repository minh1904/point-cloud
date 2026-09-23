"use client";

import { useEffect } from "react";

import { useParamsStore } from "@/store/params-store";
import { useSessionStore } from "@/store/session-store";
import { useUiStore, type StageView } from "@/store/ui-store";

/** Digit keys select a pipeline stage, in pipeline order (P7.6). */
const STAGE_KEYS: readonly StageView[] = [
  "cloud",
  "photo",
  "depth",
  "importance",
  "points",
];

/**
 * Keyboard shortcuts (P7.4, P7.7).
 *
 * One listener on `window`, registered once. The alternative — `onKeyDown` on
 * a wrapper div — only fires while something inside it has focus, and the
 * thing a viewer is most likely to be focused on is the canvas, which is not
 * focusable at all.
 *
 * The guard below matters more than it looks. Ctrl+Z inside a text field is
 * the browser's own undo, and stealing it to rewind a slider would be a
 * genuinely unpleasant surprise.
 */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

export function useShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;

      const meta = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (meta && key === "z") {
        event.preventDefault();
        // Shift+Ctrl+Z is redo on Windows and Linux; Cmd+Shift+Z on macOS.
        // Ctrl+Y is the other Windows convention and costs one more line.
        if (event.shiftKey) useParamsStore.getState().redo();
        else useParamsStore.getState().undo();
        return;
      }

      if (meta && key === "y") {
        event.preventDefault();
        useParamsStore.getState().redo();
        return;
      }

      // Everything below is a bare key, so a modifier means it was meant for
      // the browser — Ctrl+R is reload, and stealing it would be hostile.
      if (meta || event.altKey) return;

      const digit = Number(event.key);
      if (Number.isInteger(digit) && digit >= 1 && digit <= STAGE_KEYS.length) {
        event.preventDefault();
        useUiStore.getState().setStage(STAGE_KEYS[digit - 1]!);
        return;
      }

      switch (key) {
        case " ":
          event.preventDefault();
          useSessionStore.getState().togglePlaying();
          break;
        case "r":
          useSessionStore.getState().replayIntro();
          break;
        case "c":
          useUiStore.getState().toggleInspector();
          break;
        case "?":
          useUiStore.getState().toggleHelp();
          break;
        case "escape":
          if (useUiStore.getState().helpOpen) useUiStore.getState().toggleHelp();
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
