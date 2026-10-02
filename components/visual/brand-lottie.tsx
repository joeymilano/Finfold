"use client";

import React, { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useReducedMotion } from "motion/react";

/**
 * BrandLottie — themed Lottie micro-animations for empty states, success
 * moments and decorative accents.
 *
 * Assets live in `public/lottie/*.json` and were hand-picked from the
 * LottieFiles free library (https://lottiefiles.com) under the Lottie
 * Simple License, which permits commercial use without attribution.
 *
 * Defensive by design, mirroring ShaderBackdrop:
 *  - lottie-react is code-split via next/dynamic (never SSR'd);
 *  - the JSON payload is fetched lazily, only when the element scrolls
 *    near the viewport (IntersectionObserver, 200px rootMargin);
 *  - `prefers-reduced-motion` renders a static poster (first frame,
 *    non-autoplaying) instead of a live animation;
 *  - any fetch/render failure degrades to nothing — an empty-state icon
 *    disappearing must never break the surrounding UI.
 */

const LazyLottie = dynamic(() => import("lottie-react"), { ssr: false });

// Module-level cache so repeated mounts of the same asset don't refetch.
const animationCache = new Map<string, Promise<unknown>>();

function loadAnimation(src: string): Promise<unknown> {
  let cached = animationCache.get(src);
  if (!cached) {
    cached = fetch(src).then((res) => {
      if (!res.ok) throw new Error(`Lottie fetch failed: ${res.status}`);
      return res.json();
    });
    animationCache.set(src, cached);
  }
  return cached;
}

export function BrandLottie({
  src,
  className,
  loop = true,
  /** Render a static first frame instead of animating (also forced by reduced motion). */
  still = false,
  label
}: {
  /** Path under /public, e.g. "/lottie/sparkles.json" */
  src: string;
  className?: string;
  loop?: boolean;
  still?: boolean;
  /** Accessible label when the animation conveys meaning; omit for pure decoration. */
  label?: string;
}) {
  const reducedMotion = useReducedMotion();
  const hostRef = useRef<HTMLDivElement>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const [data, setData] = useState<unknown>(null);
  const [failed, setFailed] = useState(false);

  // Defer the network fetch until the animation is about to be seen.
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    if (typeof IntersectionObserver !== "function") {
      setNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!nearViewport) return;
    let cancelled = false;
    loadAnimation(src)
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [nearViewport, src]);

  const autoplay = !still && !reducedMotion;

  return (
    <div
      ref={hostRef}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      className={className}
    >
      {data && !failed ? (
        <LazyLottie
          animationData={data}
          loop={loop}
          autoplay={autoplay}
          style={{ width: "100%", height: "100%" }}
        />
      ) : null}
    </div>
  );
}
