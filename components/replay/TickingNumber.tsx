"use client";

import { useEffect } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { tickSeconds } from "./motion";

/** Eases from the previous value to the new one; renders outside React. */
export function TickingNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => format(Math.round(v)));
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) {
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, { duration: tickSeconds, ease: "easeOut" });
    return () => controls.stop();
  }, [value, mv, reduced]);
  return <motion.span className="tabular-nums">{text}</motion.span>;
}
