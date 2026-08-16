"use client";

import { Component, useEffect, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useReducedMotion } from "motion/react";

/**
 * ShaderBackdrop — the Studio Floor's living atmosphere.
 *
 * A slow MeshGradient whose palette follows the active theme (warm paper
 * in light mode, warm near-black with an ember bloom in dark mode). It is
 * wrapped deliberately defensively:
 *
 *  - `dynamic(..., { ssr: false })` keeps WebGL off the server entirely;
 *  - the inner component is mounted only after `requestIdleCallback`/
 *    `setTimeout` so the first paint of headline type is never blocked;
 *  - `prefers-reduced-motion` swaps the live shader for a static CSS
 *    gradient with the same palette;
 *  - any render-time failure inside the shader layer is caught by an
 *    error boundary that also falls back to the static gradient.
 *
 * The backdrop is purely decorative — pointer-events are disabled and it
 * renders at reduced pixel ratio to stay cheap on battery.
 */

// Static fallback painted with the same palettes. Also used while the
// shader chunk is still loading, so there is no visual pop-in.
function StaticWash({ dark }: { dark: boolean }) {
  return (
    <div
      aria-hidden
      className="absolute inset-0"
      style={{
        background: dark
          ? [
              "radial-gradient(58% 44% at 78% 18%, rgba(217,164,65,0.14), transparent 70%)",
              "radial-gradient(46% 38% at 12% 82%, rgba(78,190,203,0.08), transparent 70%)",
              "radial-gradient(70% 60% at 50% 50%, rgba(20,18,14,0.9), transparent 100%)"
            ].join(",")
          : [
              "radial-gradient(58% 44% at 78% 18%, rgba(199,142,42,0.10), transparent 70%)",
              "radial-gradient(46% 38% at 12% 82%, rgba(47,128,137,0.06), transparent 70%)"
            ].join(",")
      }}
    />
  );
}

const LIGHT_COLORS = ["#FBF9F4", "#F3EDE0", "#EADFC6", "#F6F1E7"];
const DARK_COLORS = ["#0B0A08", "#14120E", "#241B0D", "#0B0A08"];

// Lazy-loaded shader core. Imported separately so the main bundle never
// carries the WebGL payload for users who end up on the fallback path.
const LazyShaderCore = dynamic(
  () =>
    import("./shader-backdrop-core").then((m) => m.ShaderBackdropCore),
  { ssr: false }
);

export function ShaderBackdrop({ className }: { className?: string }) {
  const reducedMotion = useReducedMotion();
  const [enabled, setEnabled] = useState(false);
  const [failed, setFailed] = useState(false);
  const [dark, setDark] = useState(true);

  // Track the live theme (the app sets data-theme on <html>).
  useEffect(() => {
    const read = () =>
      setDark(document.documentElement.dataset.theme !== "light");
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"]
    });
    return () => observer.disconnect();
  }, []);

  // Defer mounting the WebGL layer until the browser is idle, so the
  // hero's type and layout paint first. Gate on reduced motion too.
  useEffect(() => {
    if (reducedMotion) return;
    let cancelled = false;
    const enable = () => {
      if (!cancelled) setEnabled(true);
    };
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(enable, { timeout: 1600 });
      return () => {
        cancelled = true;
        cancelIdleCallback(id);
      };
    }
    const id = window.setTimeout(enable, 600);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [reducedMotion]);

  const useShader = enabled && !failed && !reducedMotion;

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className ?? ""}`}
    >
      <StaticWash dark={dark} />
      {useShader ? (
        <ShaderErrorBoundary onError={() => setFailed(true)}>
          <LazyShaderCore
            colors={dark ? DARK_COLORS : LIGHT_COLORS}
            speed={0.16}
            opacity={dark ? 0.9 : 0.75}
          />
        </ShaderErrorBoundary>
      ) : null}
      {/* Vignette to keep edges quiet behind the type */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 42%, transparent 55%, rgb(var(--bg) / 0.55) 100%)"
        }}
      />
    </div>
  );
}

class ShaderErrorBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    return this.state.hasError ? null : this.props.children;
  }
}
