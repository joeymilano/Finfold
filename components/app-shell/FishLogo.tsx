import type { ImgHTMLAttributes } from "react";

type Variant = "mark" | "wordmark" | "app-icon";

interface ImgSource {
  avif: string;
  webp: string;
}

interface LogoDef {
  width: number;
  height: number;
  alt: string;
  light: ImgSource;
  /** Optional dark-theme variant (app-icon). Swapped via the `.dark` class,
   * no client-side theme read → no hydration mismatch. */
  dark?: ImgSource;
}

// AVIF (modern browsers, ~40% smaller than WebP) → WebP fallback.
// Native <picture> does the format negotiation; no next/image optimizer
// required, which matters because this app runs on Cloudflare Pages where
// the Next.js image optimization endpoint is not available.
const LOGOS: Record<Variant, LogoDef> = {
  mark: {
    width: 256,
    height: 256,
    alt: "Finfold fish logo mark",
    light: {
      avif: "/brand/fish-mark-light-256.avif",
      webp: "/brand/fish-mark-light-256.webp",
    },
  },
  wordmark: {
    width: 640,
    height: 360,
    alt: "Finfold logo",
    light: {
      avif: "/brand/wordmark-light-640.avif",
      webp: "/brand/wordmark-light-640.webp",
    },
  },
  "app-icon": {
    width: 256,
    height: 256,
    alt: "Finfold app icon",
    light: {
      avif: "/brand/app-icon-light-256.avif",
      webp: "/brand/app-icon-light-256.webp",
    },
    dark: {
      avif: "/brand/app-icon-dark-256.avif",
      webp: "/brand/app-icon-dark-256.webp",
    },
  },
};

export type FishLogoProps = {
  variant?: Variant;
  className?: string;
  /** Defaults to `true` — the logo is almost always above the fold, so we
   * eager-load it with high fetch priority so it shows on first paint
   * instead of "popping in" after a network round-trip. */
  priority?: boolean;
};

export function FishLogo({
  variant = "mark",
  className,
  priority = true,
}: FishLogoProps) {
  const def = LOGOS[variant];

  if (def.dark) {
    // Render both light + dark and toggle with the `.dark` class.
    // The hidden variant is lazy + display:none, so the browser does NOT
    // fetch it — fixing the old bug where both 700KB PNGs were downloaded.
    return (
      <>
        <LogoImage
          src={def.light}
          alt={def.alt}
          width={def.width}
          height={def.height}
          className={`${className ?? ""} dark:hidden`}
          priority={priority}
        />
        <LogoImage
          src={def.dark}
          alt=""
          aria-hidden
          width={def.width}
          height={def.height}
          className={`${className ?? ""} hidden dark:block`}
          priority={false}
        />
      </>
    );
  }

  return (
    <LogoImage
      src={def.light}
      alt={def.alt}
      width={def.width}
      height={def.height}
      className={className}
      priority={priority}
    />
  );
}

type LogoImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt"> & {
  src: ImgSource;
  alt: string;
  priority: boolean;
};

function LogoImage({ src, alt, priority, ...rest }: LogoImageProps) {
  return (
    <picture>
      <source srcSet={src.avif} type="image/avif" />
      <source srcSet={src.webp} type="image/webp" />
      {/* Fallback src is WebP — every browser that supports <picture>
          also supports WebP, so the original 1MB PNGs are never loaded. */}
      <img
        {...rest}
        src={src.webp}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        draggable={false}
      />
    </picture>
  );
}
