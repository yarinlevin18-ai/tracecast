"use client";

import { useEffect } from "react";
import type { Player } from "./usePlayer";

const EDITABLE = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/** Space play/pause, arrows step, Home/End jump, 1/2/4 speed. */
export function useReplayKeys(player: Player) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && EDITABLE.has(target.tagName)) return;
      // A focused button already toggles on space through its native activation;
      // handling it here too would fire the action twice.
      if (e.key === " " && target?.tagName === "BUTTON") return;
      switch (e.key) {
        case " ":
          e.preventDefault();
          player.toggle();
          break;
        case "ArrowRight":
          e.preventDefault();
          player.stepBy(1);
          break;
        case "ArrowLeft":
          e.preventDefault();
          player.stepBy(-1);
          break;
        case "Home":
          player.seekStep(0);
          break;
        case "End":
          player.seekStep(player.count - 1);
          break;
        case "1":
          player.setSpeed(1);
          break;
        case "2":
          player.setSpeed(2);
          break;
        case "4":
          player.setSpeed(4);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [player]);
}
