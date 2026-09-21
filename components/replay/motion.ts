import type { Transition } from "motion/react";

/**
 * The only place that defines how replay elements move. Swap these for
 * motion-lab presets when the spec lands; components import from here.
 */
export const enterTransition: Transition = { duration: 0.28, ease: [0.22, 1, 0.36, 1] };
export const enterInitial = { opacity: 0, y: 10 };
export const enterAnimate = { opacity: 1, y: 0 };

export const pulseTransition: Transition = { duration: 1.1, repeat: Infinity, ease: "easeInOut" };
export const pulseAnimate = { opacity: [1, 0.35, 1], scale: [1, 0.8, 1] };

/** Seconds for a ticking number to ease to its new value. */
export const tickSeconds = 0.35;
