import type { GenerateRequest, KitOutput } from "@/lib/content-schema";

export type ExternalPhraseOverlap = {
  evidenceId: string;
  kind: "chinese" | "english";
  phrase: string;
};

function chineseText(value: string): string {
  return [...value].filter((character) => /\p{Script=Han}/u.test(character)).join("");
}

function englishWords(value: string): string[] {
  return value.toLowerCase().match(/[a-z0-9]+(?:'[a-z0-9]+)?/g) ?? [];
}

/** Detects substantial verbatim reuse from approved external evidence. This
 * is intentionally exact rather than semantic: it blocks source copying
 * without penalizing a draft for discussing the same market idea in original
 * language. */
export function findExternalPhraseOverlaps(
  input: GenerateRequest,
  output: Pick<KitOutput, "title" | "body" | "cta">
): ExternalPhraseOverlap[] {
  const context = input.intelligenceContext;
  if (!context) return [];

  const outputText = `${output.title}\n${output.body}\n${output.cta}`;
  const outputChinese = chineseText(outputText);
  const outputEnglish = ` ${englishWords(outputText).join(" ")} `;
  const overlaps: ExternalPhraseOverlap[] = [];

  for (const evidence of context.evidence) {
    const source = `${evidence.title}\n${evidence.excerpt}`;
    const sourceChinese = chineseText(source);
    for (let index = 0; index <= sourceChinese.length - 12; index += 1) {
      const phrase = sourceChinese.slice(index, index + 12);
      if (outputChinese.includes(phrase)) {
        overlaps.push({ evidenceId: evidence.id, kind: "chinese", phrase });
        break;
      }
    }

    const sourceEnglish = englishWords(source);
    for (let index = 0; index <= sourceEnglish.length - 8; index += 1) {
      const phrase = sourceEnglish.slice(index, index + 8).join(" ");
      if (outputEnglish.includes(` ${phrase} `)) {
        overlaps.push({ evidenceId: evidence.id, kind: "english", phrase });
        break;
      }
    }
  }

  return overlaps;
}
