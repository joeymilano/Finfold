import { describe, expect, it } from "vitest";
import { editorialThemes, swissAccents, swissDisplayWeight } from "@/lib/cover/cover-themes";

const HEX = /^#[0-9a-fA-F]{6}$/;

describe("editorial themes", () => {
  it("defines every required token as a value", () => {
    editorialThemes.forEach((theme) => {
      expect(theme.paper).toBeTruthy();
      expect(theme.paper2).toBeTruthy();
      expect(theme.ink).toBeTruthy();
      expect(theme.muted).toBeTruthy();
      expect(theme.line).toBeTruthy();
      expect(theme.accent).toBeTruthy();
      expect(theme.accentSoft).toBeTruthy();
    });
  });

  it("has exactly one dark theme (Midnight Ink)", () => {
    const darkThemes = editorialThemes.filter((theme) => theme.dark);
    expect(darkThemes).toHaveLength(1);
    expect(darkThemes[0].id).toBe("midnight-ink");
  });

  it("includes a Finfold brand palette", () => {
    expect(editorialThemes.some((theme) => theme.id === "finfold-brand")).toBe(true);
  });
});

describe("swiss accents", () => {
  it("uses exactly one accent color per preset with a valid contrast pairing", () => {
    swissAccents.forEach((accent) => {
      expect(accent.accent).toMatch(HEX);
      expect(accent.accentOn).toMatch(HEX);
    });
  });

  it("pairs light accents (yellow/green) with dark accentOn text", () => {
    const lemonYellow = swissAccents.find((accent) => accent.id === "lemon-yellow")!;
    const lemonGreen = swissAccents.find((accent) => accent.id === "lemon-green")!;
    expect(lemonYellow.accentOn).toBe("#0a0a0a");
    expect(lemonGreen.accentOn).toBe("#0a0a0a");
  });

  it("includes a Finfold bronze accent", () => {
    expect(swissAccents.some((accent) => accent.id === "finfold-bronze")).toBe(true);
  });
});

describe("swiss display weight — the larger, the lighter", () => {
  it("assigns lighter weight as font size increases", () => {
    expect(swissDisplayWeight(220)).toBe(200);
    expect(swissDisplayWeight(140)).toBe(300);
    expect(swissDisplayWeight(60)).toBe(400);
  });

  it("never returns a weight above 400 for any display size", () => {
    [40, 80, 120, 160, 200, 240].forEach((size) => {
      expect(swissDisplayWeight(size)).toBeLessThanOrEqual(400);
    });
  });
});
