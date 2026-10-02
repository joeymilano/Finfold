import { describe, expect, it } from "vitest";
import { assessToneAlignment, buildToneBaseline, extractToneProfile } from "@/lib/tone-drift";

const topPosts = [
  {
    title: "A launch lesson from last Tuesday",
    body: "We shipped the approval flow last Tuesday. It removed one review handoff.\n\nWhat would you remove first?",
    cta: "Reply with the handoff you would remove."
  },
  {
    title: "The smallest release change that mattered",
    body: "We moved the review earlier. The team stopped waiting on the same missing field.\n\nWhich review step slows your work down?",
    cta: "Share the one step you would change."
  },
  {
    title: "A useful constraint for this week's release",
    body: "We kept the release scope narrow. That made the feedback easy to act on.\n\nWhere could a smaller scope help?",
    cta: "Reply with your constraint."
  }
];

describe("tone drift", () => {
  it("builds a high-confidence baseline from three consistent high performers", () => {
    const baseline = buildToneBaseline({ performanceExamples: topPosts, toneKeywords: ["specific", "direct"] });

    expect(baseline).toMatchObject({
      source: "performance",
      confidence: "high",
      performanceSampleCount: 3
    });
    expect(baseline?.consistency).toBeGreaterThanOrEqual(70);
  });

  it("keeps a similar draft aligned with its successful voice baseline", () => {
    const baseline = buildToneBaseline({ performanceExamples: topPosts });
    const assessment = assessToneAlignment({
      title: "A review change we are keeping",
      body: "We moved one review question earlier. It kept the release owner from chasing the same answer twice.\n\nWhat question would you ask sooner?",
      cta: "Reply with the question you would move."
    }, baseline);

    expect(assessment.status).toBe("aligned");
    expect(assessment.score).toBeGreaterThanOrEqual(75);
    expect(assessment.differences.every((difference) => difference.key !== "humanVoice")).toBe(true);
    expect(assessment.directionEn).toBeTruthy();
  });

  it("flags generic, promotional copy that diverges from the reference voice", () => {
    const baseline = buildToneBaseline({ performanceExamples: topPosts });
    const assessment = assessToneAlignment({
      title: "A revolutionary transformation for every team!!!",
      body: "In today's fast-paced world, we are thrilled to announce our game-changing platform. It will unlock seamless, cutting-edge collaboration for everyone!!! #growth #innovation #future\n\nSign up today to transform your workflow and unlock the best-in-class future.",
      cta: "Sign up now!!!"
    }, baseline);

    expect(assessment.status).toBe("drift");
    expect(assessment.score).toBeLessThan(55);
    expect(assessment.differences.map((difference) => difference.key)).toContain("humanVoice");
    expect(assessment.directionEn).toContain("reference voice");
  });

  it("uses approved examples as a low-confidence brand-memory fallback", () => {
    const baseline = buildToneBaseline({ brandMemoryExamples: topPosts.slice(0, 2) });
    const assessment = assessToneAlignment(topPosts[0], baseline);

    expect(baseline).toMatchObject({ source: "brand_memory", confidence: "low" });
    expect(assessment.status).toBe("watch");
  });

  it("keeps platform formatting signals anchored to successful same-platform posts", () => {
    const baseline = buildToneBaseline({
      performanceExamples: topPosts.slice(0, 2),
      brandMemoryExamples: [{
        title: "A very different platform style",
        body: "✨ A short brand note. #brand #launch #story\n\nAnother short line!",
        cta: "Follow for more!"
      }]
    });

    expect(baseline).toMatchObject({ source: "mixed", performanceSampleCount: 2, brandMemorySampleCount: 1 });
    expect(baseline?.profile.hashtagPerHundredChars).toBe(0);
    expect(baseline?.profile.emojiPerHundredChars).toBe(0);
  });

  it("returns unavailable when the user has no reference content", () => {
    expect(buildToneBaseline({})).toBeNull();
    expect(assessToneAlignment(topPosts[0], null)).toMatchObject({
      status: "unavailable",
      score: null,
      differences: []
    });
  });

  it("profiles Chinese writing without treating punctuation as an error", () => {
    const profile = extractToneProfile({
      title: "把复盘放在发布前",
      body: "我们把复盘问题提前到发布前。团队少了一次来回确认。\n\n你最想提前确认什么？",
      cta: "欢迎分享你的做法。"
    });

    expect(profile.opening).toBe("story");
    expect(profile.humanVoice).toBe(100);
  });
});