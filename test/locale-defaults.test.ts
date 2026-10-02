import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectLocaleFromHeaders, localeFromLanguageTag } from "@/lib/i18n";
import { LOCALE_INIT_SCRIPT } from "@/lib/locale-init";
import { getStoredLocale, LOCALE_STORAGE_KEY } from "@/lib/theme";

const originalLanguages = navigator.languages;
const originalLanguage = navigator.language;
const storageValues = new Map<string, string>();
const storage = {
  get length() { return storageValues.size; },
  clear: () => storageValues.clear(),
  getItem: (key: string) => storageValues.get(key) ?? null,
  key: (index: number) => [...storageValues.keys()][index] ?? null,
  removeItem: (key: string) => { storageValues.delete(key); },
  setItem: (key: string, value: string) => { storageValues.set(key, value); }
} satisfies Storage;

beforeEach(() => {
  Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
  window.history.replaceState({}, "", "/dashboard");
});

function setBrowserLanguages(languages: string[]) {
  Object.defineProperty(navigator, "languages", { configurable: true, value: languages });
  Object.defineProperty(navigator, "language", { configurable: true, value: languages[0] ?? "" });
}

afterEach(() => {
  window.history.replaceState({}, "", "/");
  storage.clear();
  document.cookie = `${LOCALE_STORAGE_KEY}=; path=/; max-age=0`;
  document.documentElement.lang = "";
  Object.defineProperty(navigator, "languages", { configurable: true, value: originalLanguages });
  Object.defineProperty(navigator, "language", { configurable: true, value: originalLanguage });
});

describe("bilingual UI defaults", () => {
  it.each([
    ["/", "en", "zh-CN"],
    ["/en", "zh", "en"],
    ["/en/tools", "zh", "en"]
  ])("keeps the document language tied to %s despite a saved %s preference", (path, saved, expected) => {
    window.history.replaceState({}, "", path);
    storage.setItem(LOCALE_STORAGE_KEY, saved);
    setBrowserLanguages(["en-US"]);
    Function(LOCALE_INIT_SCRIPT)();
    expect(document.documentElement.lang).toBe(expected);
    expect(storage.getItem(LOCALE_STORAGE_KEY)).toBe(saved);
  });

  it("keeps the Chinese homepage language in a fresh non-Chinese browser", () => {
    window.history.replaceState({}, "", "/");
    setBrowserLanguages(["en-US"]);
    Function(LOCALE_INIT_SCRIPT)();
    expect(document.documentElement.lang).toBe("zh-CN");
  });

  it("uses Chinese chrome only for Chinese browser locales", () => {
    expect(localeFromLanguageTag("zh-CN")).toBe("zh");
    expect(localeFromLanguageTag("zh-HK")).toBe("zh");
    expect(localeFromLanguageTag("fr-FR")).toBe("en");
    expect(localeFromLanguageTag("ja-JP")).toBe("en");
    expect(localeFromLanguageTag("ar-SA")).toBe("en");
  });

  it("uses English for non-Chinese Accept-Language while honoring a saved cookie", () => {
    expect(detectLocaleFromHeaders(new Headers({ "accept-language": "pl-PL,pl;q=0.9,en;q=0.8" }))).toBe("en");
    expect(detectLocaleFromHeaders(new Headers({ "accept-language": "zh-TW,zh;q=0.9" }))).toBe("zh");
    expect(detectLocaleFromHeaders(new Headers({
      cookie: "finfold-locale=zh",
      "accept-language": "fr-FR,fr;q=0.9"
    }))).toBe("zh");
  });

  it("lets an unsaved browser locale choose the client UI fallback", () => {
    setBrowserLanguages(["th-TH", "en-US"]);
    expect(getStoredLocale()).toBe("en");

    setBrowserLanguages(["zh-SG", "en-US"]);
    expect(getStoredLocale()).toBe("zh");
  });

  it("sets the pre-hydration document language from a non-Chinese browser", () => {
    setBrowserLanguages(["ar-SA", "en-US"]);
    Function(LOCALE_INIT_SCRIPT)();
    expect(document.documentElement.lang).toBe("en");
  });
});
