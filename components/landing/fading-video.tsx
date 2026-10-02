"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

/**
 * FadingVideo — atmospheric video that never cuts.
 *
 *  - starts invisible; on `loadeddata` fades in over 500ms (via
 *    requestAnimationFrame so the opacity transition always commits);
 *  - on `timeupdate`, once the remaining runtime drops to ≤0.55s it
 *    fades out over 550ms, so the loop point is hidden by darkness;
 *  - on `ended` it loops itself: a single src rewinds and replays,
 *    an array of srcs cycles to the next one (the fresh `loadeddata`
 *    fades it back in).
 *
 * Rendered muted/inline and preload="auto" — purely decorative; wrap
 * it in an aria-hidden, pointer-events-none layer and gate it on
 * `useReducedMotion()` at the call site.
 */
export function FadingVideo({
  src,
  className,
  style
}: {
  src: string | string[];
  className?: string;
  style?: CSSProperties;
}) {
  const sources = Array.isArray(src) ? src : [src];
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [fadeMs, setFadeMs] = useState(500);
  // The src is attached only after mount: a slow remote video with
  // preload="auto" would otherwise hold back `window.load`, which dev
  // servers and preview health checks may wait on.
  const [mounted, setMounted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fadingOut = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const v = videoRef.current;
    if (v) void v.play().catch(() => {});
  }, [mounted, index]);

  // Autoplay is suspended while the tab is hidden; resume when it
  // becomes visible again (browsers do not always restart autoplay).
  useEffect(() => {
    function resume() {
      const v = videoRef.current;
      if (document.visibilityState === "visible" && v && v.paused) {
        void v.play().catch(() => {});
      }
    }
    document.addEventListener("visibilitychange", resume);
    return () => document.removeEventListener("visibilitychange", resume);
  }, []);

  function fadeIn(ms: number) {
    setFadeMs(ms);
    fadingOut.current = false;
    requestAnimationFrame(() => setVisible(true));
  }

  function fadeOut(ms: number) {
    if (fadingOut.current) return;
    fadingOut.current = true;
    setFadeMs(ms);
    setVisible(false);
  }

  return (
    <video
      ref={videoRef}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transition: `opacity ${fadeMs}ms ease`,
        ...style
      }}
      src={mounted ? sources[index % sources.length] : undefined}
      autoPlay
      muted
      playsInline
      preload={mounted ? "auto" : "none"}
      onLoadedData={(e) => {
        // Autoplay can lose the race when a local file reaches
        // readyState before the browser honors the autoplay attribute —
        // explicitly (re)start playback whenever data lands.
        void e.currentTarget.play().catch(() => {});
        fadeIn(500);
      }}
      onTimeUpdate={(e) => {
        const v = e.currentTarget;
        if (!Number.isFinite(v.duration) || v.duration <= 0) return;
        if (v.duration - v.currentTime <= 0.55) fadeOut(550);
      }}
      onEnded={() => {
        const v = videoRef.current;
        if (!v) return;
        if (sources.length > 1) {
          // New src triggers a fresh loadeddata → fade back in.
          setIndex((i) => (i + 1) % sources.length);
        } else {
          v.currentTime = 0;
          void v.play();
          fadeIn(500);
        }
      }}
    />
  );
}
