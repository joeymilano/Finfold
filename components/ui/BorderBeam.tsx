"use client";

import React, { useEffect, useState } from "react";
import { motion, type MotionStyle, type Transition, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";

type BorderBeamProps = {
  size?: number;
  duration?: number;
  delay?: number;
  colorFrom?: string;
  colorTo?: string;
  transition?: Transition;
  className?: string;
  style?: React.CSSProperties;
  reverse?: boolean;
  initialOffset?: number;
  borderWidth?: number;
  beamOpacity?: number;
};

/**
 * A restrained adaptation of Magic UI's Border Beam. The moving gradient is
 * masked to the host's inherited border radius so it can signal live work
 * without changing layout or intercepting input.
 */
export function BorderBeam({
  className,
  size = 96,
  delay = 0,
  duration = 6,
  colorFrom = "#2dd4bf",
  colorTo = "#f0c275",
  transition,
  style,
  reverse = false,
  initialOffset = 0,
  borderWidth = 1,
  beamOpacity = 1
}: BorderBeamProps) {
  const prefersReducedMotion = useReducedMotion();
  const [hydrated, setHydrated] = useState(false);
  const reduceMotion = hydrated && Boolean(prefersReducedMotion);

  useEffect(() => setHydrated(true), []);

  return (
    <div
      aria-hidden="true"
      data-border-beam=""
      data-agent-border-beam=""
      className="pointer-events-none absolute inset-0 z-30 overflow-hidden rounded-[inherit]"
      style={{
        padding: borderWidth,
        WebkitMaskImage: "linear-gradient(#000, #000), linear-gradient(#000, #000)",
        WebkitMaskClip: "content-box, border-box",
        WebkitMaskComposite: "xor",
        maskImage: "linear-gradient(#000, #000), linear-gradient(#000, #000)",
        maskClip: "content-box, border-box",
        maskComposite: "exclude"
      }}
    >
      <motion.div
        className={cn("absolute aspect-square rounded-full", className)}
        style={{
          width: size,
          background: `linear-gradient(90deg, transparent, ${colorFrom} 38%, ${colorTo} 66%, transparent)`,
          filter: "blur(0.2px) drop-shadow(0 0 6px rgba(45, 212, 191, 0.42))",
          offsetPath: `rect(0 auto auto 0 round ${size}px)`,
          offsetDistance: `${initialOffset}%`,
          ...style
        } as MotionStyle}
        initial={{ offsetDistance: `${initialOffset}%`, opacity: 0 }}
        animate={reduceMotion
          ? { offsetDistance: "42%", opacity: beamOpacity * 0.82 }
          : {
              offsetDistance: reverse
                ? [`${100 - initialOffset}%`, `${-initialOffset}%`]
                : [`${initialOffset}%`, `${100 + initialOffset}%`],
              opacity: [beamOpacity * 0.68, beamOpacity, beamOpacity * 0.68]
            }}
        transition={reduceMotion ? { duration: 0 } : {
          repeat: Infinity,
          ease: "linear",
          duration,
          delay: -delay,
          ...transition
        }}
      />
    </div>
  );
}
