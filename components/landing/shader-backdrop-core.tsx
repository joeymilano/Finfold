"use client";

import { MeshGradient } from "@paper-design/shaders-react";

/**
 * The actual WebGL layer for ShaderBackdrop — split into its own module so
 * `next/dynamic` can keep the shader chunk out of the initial bundle and
 * away from SSR.
 *
 * `maxPixelCount` caps the total rendered pixels so 5K displays don't push
 * millions of fragments for a purely atmospheric layer.
 */
export function ShaderBackdropCore({
  colors,
  speed,
  opacity
}: {
  colors: string[];
  speed: number;
  opacity: number;
}) {
  return (
    <MeshGradient
      colors={colors}
      speed={speed}
      distortion={0.32}
      swirl={0.12}
      grainMixer={0.38}
      grainOverlay={0.18}
      minPixelRatio={0.5}
      maxPixelCount={1280 * 720}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        opacity
      }}
    />
  );
}
