import Image, { type ImageProps } from "next/image";

type FishLogoProps = Omit<ImageProps, "src" | "alt" | "width" | "height"> & {
  variant?: "mark" | "wordmark" | "app-icon";
};

const logoSources = {
  mark: "/brand/fish-mark-light.png",
  wordmark: "/brand/logo-horizontal-light.png",
  "app-icon": "/brand/app-icon.png"
} as const;

const logoAlt = {
  mark: "Finfold fish logo mark",
  wordmark: "Finfold logo",
  "app-icon": "Finfold app icon"
} as const;

const logoSizes = {
  mark: { width: 1252, height: 1252 },
  wordmark: { width: 1679, height: 943 },
  "app-icon": { width: 1254, height: 1254 }
} as const;

export function FishLogo({ variant = "mark", className, ...props }: FishLogoProps) {
  const size = logoSizes[variant];

  return (
    <Image
      src={logoSources[variant]}
      alt={logoAlt[variant]}
      width={size.width}
      height={size.height}
      className={className}
      draggable={false}
      {...props}
    />
  );
}
