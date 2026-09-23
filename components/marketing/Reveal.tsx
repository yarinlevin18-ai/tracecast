"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  delay?: number;
  /** Animate on mount (hero) instead of when scrolled into view. */
  immediate?: boolean;
};

const EASE = [0.16, 1, 0.3, 1] as const;

/** Fades content up once, so each section lands in reading order. Static under reduced motion. */
export function Reveal({ children, className, delay = 0, immediate = false }: Props) {
  const reduce = useReducedMotion();
  const target = { opacity: 1, y: 0 };
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 20 }}
      {...(immediate ? { animate: target } : { whileInView: target, viewport: { once: true, amount: 0.25 } })}
      transition={{ duration: 0.7, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}
