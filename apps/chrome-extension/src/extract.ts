import type { PageContext } from "./types";

/** Runs inside the active page through chrome.scripting.executeScript. */
export function extractPageContext(): PageContext | null {
  const clean = (value: string) => value.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  // Some feeds (LinkedIn notably) render each post's text twice in the DOM —
  // once visibly and once in a non-`display:none` preview/measure layer — so
  // plain container text arrives doubled. Collapse adjacent duplicate lines
  // and whole-block mirrors before the text is capped or sent anywhere.
  const deduplicate = (value: string): string => {
    // Markup indentation gives the second copy a leading space the first lacks,
    // so lines are trimmed for both comparison and output.
    const lines = value.split("\n").map((line) => line.trim()).filter((line) => line !== "");
    const collapsed: string[] = [];
    for (const line of lines) {
      if (line === collapsed[collapsed.length - 1]) continue;
      collapsed.push(line);
    }
    // A container rendered twice side by side survives line collapsing as
    // an exact whole-text mirror; halve it once when the compacted text
    // repeats itself (works with or without newline separators).
    const compact = collapsed.join("").replace(/\s+/g, "");
    if (compact.length >= 40 && compact.length % 2 === 0
      && compact.slice(0, compact.length / 2) === compact.slice(compact.length / 2)) {
      let seen = 0;
      for (let index = 0; index < value.length; index++) {
        if (!/\s/.test(value[index])) seen += 1;
        if (seen === compact.length / 2) return value.slice(0, index + 1).trim();
      }
    }
    return collapsed.join("\n");
  };
  const selected = clean(window.getSelection()?.toString() ?? "");
  const blockedSelectors = [
    "script", "style", "noscript", "nav", "footer", "aside", "form",
    "[hidden]", "[aria-hidden='true']", "[role='navigation']", "[role='dialog']",
    "[class*='cookie']", "[id*='cookie']", "[class*='advert']", "[class*='promo']",
    "[class*='sidebar']", "[class*='footer']", "[class*='navbar']"
  ].join(",");

  const visibleText = (element: Element): string => {
    const clone = element.cloneNode(true) as Element;
    const sourceDescendants = Array.from(element.querySelectorAll("*"));
    const clonedDescendants = Array.from(clone.querySelectorAll("*"));
    sourceDescendants.forEach((source, index) => {
      const style = window.getComputedStyle(source);
      if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") {
        clonedDescendants[index]?.remove();
      }
    });
    clone.querySelectorAll(blockedSelectors).forEach((node) => node.remove());
    clone.querySelectorAll("input, textarea, select, option, button").forEach((node) => node.remove());
    // Feeds that clamp long text (LinkedIn's "…more" layer, X's tweet clamp)
    // keep a second full copy of the text next to the visible one, often with
    // no whitespace between them. Drop any later sibling whose entire text
    // matches an earlier one, so each paragraph survives exactly once.
    for (const parent of [clone as Element, ...Array.from(clone.querySelectorAll("*"))]) {
      let previousKey: string | null = null;
      for (const child of Array.from(parent.children)) {
        const key = clean(child.textContent ?? "");
        if (key === "") continue;
        // Only consecutive duplicates are clamp artifacts; a line that
        // legitimately repeats elsewhere in the article survives.
        if (previousKey !== null && key === previousKey) { child.remove(); continue; }
        previousKey = key;
      }
    }
    return clean(clone.textContent ?? "");
  };
  const candidates = Array.from(document.querySelectorAll(
    "article, main, [role='main'], #content, #main-content, .article, .post, .content, body > section, body > div"
  ));
  const root = candidates
    .map((element) => ({ element, text: visibleText(element) }))
    .sort((left, right) => right.text.length - left.text.length)[0];
  const fallback = document.body ? visibleText(document.body) : "";
  const text = deduplicate(selected.length >= 20 ? selected : root?.text || fallback).slice(0, 8_000);
  if (text.length < 20) return null;

  const meta = (selector: string) => document.querySelector<HTMLMetaElement>(selector)?.content?.trim() ?? "";
  return {
    url: location.href.slice(0, 2_048),
    title: clean(document.title || location.hostname).slice(0, 300),
    siteName: clean(meta("meta[property='og:site_name']") || location.hostname).slice(0, 120),
    description: clean(meta("meta[name='description']") || meta("meta[property='og:description']")).slice(0, 500),
    language: (document.documentElement.lang || navigator.language || "").slice(0, 35),
    text,
    selectionUsed: selected.length >= 20
  };
}
