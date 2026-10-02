"use client";

import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

type LoadState = "loading" | "loaded" | "failed";

/**
 * UserAvatar — signed-in avatar with a letter-initial fallback that is always
 * present underneath the image.
 *
 * While the image is still downloading (or after it fails, or when there is no
 * avatar at all) the circle shows the user's initial, so a slow or broken
 * avatar URL never leaves an empty circle or a broken-image icon.
 *
 * The initial lives under the image: it stays visible until the image has
 * actually painted (loaded), and comes back permanently on error.
 */
export function UserAvatar({
  avatarUrl,
  fallback,
  alt,
  className,
  circleClassName
}: {
  avatarUrl: string | null;
  /** Initial to display while the image is unavailable (already uppercased). */
  fallback: string;
  /** Accessible name (email or display name) announced in every state. */
  alt: string;
  /** Sizing + text sizing classes, e.g. "h-8 w-8 text-sm". */
  className?: string;
  /** Circle background override; defaults to the action color pair. */
  circleClassName?: string;
}) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [state, setState] = useState<LoadState>("loading");

  useEffect(() => {
    // A cached image can finish before hydration replays onLoad; re-check it.
    setState("loading");
    const img = imgRef.current;
    if (img?.complete) {
      setState(img.naturalWidth > 0 ? "loaded" : "failed");
    }
  }, [avatarUrl]);

  const showImage = Boolean(avatarUrl) && state !== "failed";
  const initialHidden = showImage && state === "loaded";

  return (
    <span
      role="img"
      aria-label={alt}
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold",
        circleClassName ?? "bg-action text-on-action",
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn("transition-opacity", initialHidden ? "opacity-0" : "opacity-100")}
      >
        {fallback}
      </span>
      {showImage && avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- avatar URLs are
        // cache-busted (?t=) and unoptimized; a raw img lets us detect the
        // cached-complete state and swap back to the initial on failure.
        <img
          ref={imgRef}
          src={avatarUrl}
          alt=""
          aria-hidden="true"
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-opacity",
            state === "loaded" ? "opacity-100" : "opacity-0"
          )}
          onLoad={() => setState("loaded")}
          onError={() => setState("failed")}
          decoding="async"
        />
      ) : null}
    </span>
  );
}
