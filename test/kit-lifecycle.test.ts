import { describe, expect, it } from "vitest";
import type { ContentKit, KitOutput } from "@/lib/content-schema";
import { getKitLifecycle, summarizeSignal } from "@/lib/kit-lifecycle";
import { mapContentKitRow } from "@/lib/kit-record";

function output(publishStatus: KitOutput["publishStatus"]): KitOutput {
  return {
    id: crypto.randomUUID(),
    platform: "linkedin",
    title: "A useful launch note",
    body: "Body",
    cta: "Try it",
    notes: "Notes",
    strategy: "Strategy",
    locked: false,
    publishStatus,
    imageUrl: "",
    userEdited: false,
    publishedUrl: ""
  };
}

describe("kit lifecycle", () => {
  it("moves the next action from publishing to measurement to iteration", () => {
    const draft = getKitLifecycle({ outputs: [output("draft")] }, "en");
    expect(draft.nextAction).toContain("publish");
    expect(draft.stages.map((stage) => stage.state)).toEqual(["complete", "complete", "current", "upcoming"]);

    const posted = getKitLifecycle({ outputs: [output("posted")] }, "en");
    expect(posted.nextAction).toContain("performance data");
    expect(posted.postedCount).toBe(1);

    const measured = getKitLifecycle({ outputs: [output("measured")] }, "en");
    expect(measured.nextAction).toContain("reusable rule");
    expect(measured.measuredCount).toBe(1);

    const iterated = getKitLifecycle({ outputs: [output("iterated")] }, "en");
    expect(iterated.nextAction).toContain("next signal");
    expect(iterated.stages.every((stage) => stage.state === "complete")).toBe(true);
  });

  it("summarizes long signals without exposing the full source in history navigation", () => {
    expect(summarizeSignal("  one\n\n signal   with spacing  ")).toBe("one signal with spacing");
    expect(summarizeSignal("A".repeat(100), 20)).toBe(`${"A".repeat(19)}…`);
  });

  it("maps persisted snake-case output state into the product model", () => {
    const kit = mapContentKitRow({
      id: "kit-1",
      growth_mission_id: "9cc86165-4795-4e78-ac2e-692f51fdbba7",
      idea_text: "A product update with enough context",
      goal: "lead-gen",
      persona: "ai-saas",
      platforms: ["linkedin"],
      media_assets: [],
      status: "saved",
      created_at: "2026-07-15T00:00:00.000Z",
      kit_outputs: [
        {
          id: "output-1",
          platform: "linkedin",
          title: "Title",
          body: "Body",
          cta: "CTA",
          notes: "Notes",
          strategy: "Strategy",
          locked: false,
          publish_status: "measured",
          image_url: "",
          final_body: "Edited body",
          user_edited: true,
          published_url: "https://example.com/post",
          published_at: "2026-07-15T01:00:00.000Z",
          visual_assets: [{
            id: "asset-1",
            asset_type: "article_illustration",
            position_index: 0,
            visual_role: "concept",
            source_excerpt: "Edited body",
            placement_hint: "After paragraph",
            prompt: "Editorial visual",
            image_url: "https://example.com/visual.jpg",
            alt_text: "A visual"
          }]
        }
      ]
    });

    expect(kit).toMatchObject<Partial<ContentKit>>({
      id: "kit-1",
      growthMissionId: "9cc86165-4795-4e78-ac2e-692f51fdbba7",
      status: "saved"
    });
    expect(kit.outputs[0]).toMatchObject({
      publishStatus: "measured",
      finalBody: "Edited body",
      userEdited: true,
      publishedUrl: "https://example.com/post"
    });
    expect(kit.outputs[0].visualAssets?.[0]).toMatchObject({ id: "asset-1", positionIndex: 0, role: "concept" });
  });
});
