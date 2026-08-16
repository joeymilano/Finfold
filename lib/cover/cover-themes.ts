export type EditorialTheme = {
  id: string;
  nameZh: string;
  nameEn: string;
  dark: boolean;
  paper: string;
  paper2: string;
  ink: string;
  muted: string;
  line: string;
  accent: string;
  accentSoft: string;
};

export const editorialThemes: EditorialTheme[] = [
  {
    id: "ink-classic",
    nameZh: "墨色经典",
    nameEn: "Ink Classic",
    dark: false,
    paper: "#f3f0e8",
    paper2: "#ebe6da",
    ink: "#0a0a0b",
    muted: "#68625a",
    line: "rgba(10,10,11,.22)",
    accent: "#111111",
    accentSoft: "#d8d2c6"
  },
  {
    id: "indigo-porcelain",
    nameZh: "靛蓝瓷",
    nameEn: "Indigo Porcelain",
    dark: false,
    paper: "#f2f4f5",
    paper2: "#e5ebef",
    ink: "#0a1f3d",
    muted: "#5f6d78",
    line: "rgba(10,31,61,.20)",
    accent: "#315d93",
    accentSoft: "#d7e1ec"
  },
  {
    id: "forest-ink",
    nameZh: "森林墨",
    nameEn: "Forest Ink",
    dark: false,
    paper: "#f5f1e8",
    paper2: "#e8dfcf",
    ink: "#16251b",
    muted: "#5d665d",
    line: "rgba(22,37,27,.22)",
    accent: "#2e6b4f",
    accentSoft: "#d4dfd2"
  },
  {
    id: "kraft-paper",
    nameZh: "牛皮纸",
    nameEn: "Kraft Paper",
    dark: false,
    paper: "#eedfc7",
    paper2: "#dfc9a8",
    ink: "#2a1e13",
    muted: "#755f49",
    line: "rgba(42,30,19,.24)",
    accent: "#9b5a2e",
    accentSoft: "#d5b58f"
  },
  {
    id: "dune",
    nameZh: "沙丘",
    nameEn: "Dune",
    dark: false,
    paper: "#f0e6d2",
    paper2: "#ded0b7",
    ink: "#1f1a14",
    muted: "#6f6557",
    line: "rgba(31,26,20,.22)",
    accent: "#8f7650",
    accentSoft: "#d4c2a4"
  },
  {
    id: "midnight-ink",
    nameZh: "暗夜墨",
    nameEn: "Midnight Ink",
    dark: true,
    paper: "#0e0d0c",
    paper2: "#1a1714",
    ink: "#ece2cf",
    muted: "#9a8c75",
    line: "rgba(236,226,207,.22)",
    accent: "#d4a04a",
    accentSoft: "#3a2a14"
  },
  {
    id: "finfold-brand",
    nameZh: "Finfold 品牌",
    nameEn: "Finfold Brand",
    dark: false,
    paper: "#f5f4ef",
    paper2: "#ece7d8",
    ink: "#121821",
    muted: "#626474",
    line: "rgba(18,24,33,.20)",
    accent: "#b5803d",
    accentSoft: "#e2d2b4"
  }
];

export type SwissAccent = {
  id: string;
  nameZh: string;
  nameEn: string;
  paper: string;
  ink: string;
  grey1: string;
  grey2: string;
  grey3: string;
  accent: string;
  accentOn: string;
};

const swissBase = {
  paper: "#fafaf8",
  ink: "#0a0a0a",
  grey1: "#f0f0ee",
  grey2: "#d4d4d2",
  grey3: "#737373"
};

export const swissAccents: SwissAccent[] = [
  { id: "ikb", nameZh: "克莱因蓝", nameEn: "IKB Blue", ...swissBase, accent: "#002FA7", accentOn: "#ffffff" },
  { id: "lemon-yellow", nameZh: "柠檬黄", nameEn: "Lemon Yellow", ...swissBase, accent: "#FFD500", accentOn: "#0a0a0a" },
  { id: "lemon-green", nameZh: "柠檬绿", nameEn: "Lemon Green", ...swissBase, accent: "#C5E803", accentOn: "#0a0a0a" },
  { id: "safety-orange", nameZh: "安全橙", nameEn: "Safety Orange", ...swissBase, accent: "#FF6B35", accentOn: "#ffffff" },
  { id: "finfold-bronze", nameZh: "Finfold 青铜", nameEn: "Finfold Bronze", ...swissBase, accent: "#B5803D", accentOn: "#ffffff" }
];

export function getEditorialTheme(id: string): EditorialTheme {
  return editorialThemes.find((theme) => theme.id === id) ?? editorialThemes[0];
}

export function getSwissAccent(id: string): SwissAccent {
  return swissAccents.find((accent) => accent.id === id) ?? swissAccents[0];
}

/** Minimum readable body size (px) at 1080-wide export resolution. */
export const minMobileBodyPx = 28;

/**
 * "The larger, the lighter" — Swiss display weight must drop as size grows.
 * Returns a weight in [200, 400] for a given canvas-relative font size (px at 1080 scale).
 */
export function swissDisplayWeight(fontSizeAt1080: number): number {
  if (fontSizeAt1080 >= 180) return 200;
  if (fontSizeAt1080 >= 120) return 300;
  return 400;
}
