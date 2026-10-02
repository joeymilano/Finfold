/**
 * Evidence footnote navigation (设计方案 §3.5 P1).
 *
 * Pure DOM helpers — no router state, no context. Clicking an `E{n}` marker
 * (prose superscript, report badge, or card id) scrolls to the matching
 * anchor and plays a short flash so the destination is unmistakable.
 * All lookups are passive: a miss simply does nothing.
 */

const FLASH_CLASS = "evidence-flash";
const FLASH_MS = 1600;

function anchor(selector: string): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>(selector);
}

function flash(target: HTMLElement): void {
  target.classList.remove(FLASH_CLASS);
  void target.offsetWidth; // restart the animation when re-triggered quickly
  target.classList.add(FLASH_CLASS);
  window.setTimeout(() => target.classList.remove(FLASH_CLASS), FLASH_MS);
}

function reveal(target: HTMLElement): void {
  // The card's raw data may live inside a collapsed <details> — the card
  // itself is the anchor, so opening it is a courtesy, not a requirement.
  const closed = target.querySelector("details:not([open])");
  if (closed instanceof HTMLDetailsElement) closed.open = true;
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  flash(target);
}

/** Scroll to the evidence card with this id (E1, E2, …) and flash it. */
export function focusEvidenceCard(id: string): void {
  const target = anchor(`[data-evidence-card="${cssEscape(id)}"]`);
  if (target) reveal(target);
}

/**
 * Scroll back to where this evidence is cited — the prose superscript first,
 * then any report badge. Used from the card's own id marker.
 */
export function focusEvidenceRef(id: string): void {
  const escaped = cssEscape(id);
  const target
    = anchor(`[data-agent-message-content] [data-evidence-ref="${escaped}"]`)
      ?? anchor(`[data-evidence-ref="${escaped}"]`);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  flash(target);
}

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  return value.replace(/["\\]/g, "\\$&");
}
