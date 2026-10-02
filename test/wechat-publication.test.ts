import { describe, expect, it } from "vitest";
import type { KitOutput } from "@/lib/content-schema";
import {
  buildWechatPublicationSnapshot,
  deriveWechatPublishingCapability,
  fingerprintWechatPublicationSnapshot,
  getWechatPublishingFeatureConfig,
  mapWechatProviderPublicationStatus,
  validateWechatPublicationSnapshot
} from "@/lib/wechat-publication";

const allFeatures = {
  componentEnabled: true,
  draftPublishingEnabled: true,
  formalPublishingEnabled: true
};

const output: KitOutput = {
  platform: "wechat",
  title: "从内容生成走向真实增长闭环",
  body: "第一段清楚说明文章价值并作为可靠摘要。\n\n## 方法\n\n正文继续推进观点。",
  summary: "第一段清楚说明文章价值并作为可靠摘要。",
  cta: "继续关注下一次真实数据复盘",
  notes: "",
  strategy: "",
  imageUrl: "https://cdn.example.com/cover.jpg",
  locked: false,
  publishStatus: "draft",
  userEdited: false,
  visualAssets: [{
    id: "asset-1",
    assetType: "article_illustration",
    imageUrl: "https://cdn.example.com/body.png",
    altText: "流程图",
    positionIndex: 0,
    sourceExcerpt: "正文继续推进观点",
    placementHint: "after",
    role: "process",
    prompt: "process",
    revision: 1,
    isCurrent: true,
    metadata: {}
  }]
};

describe("WeChat publishing policy", () => {
  it("stays fail-closed behind independent component, draft, and formal flags", () => {
    expect(getWechatPublishingFeatureConfig({
      WECHAT_COMPONENT_ENABLED: "true",
      WECHAT_DRAFT_PUBLISHING_ENABLED: "false",
      WECHAT_FORMAL_PUBLISHING_ENABLED: "true"
    })).toEqual({
      componentEnabled: true,
      draftPublishingEnabled: false,
      formalPublishingEnabled: true
    });

    expect(deriveWechatPublishingCapability({
      grantedScopes: ["wechat_func_7", "wechat_func_11"],
      providerMetadata: { verified: true, serviceType: 2 },
      features: { ...allFeatures, draftPublishingEnabled: false }
    })).toMatchObject({ canCreateDraft: false, canSubmitPublish: false });
  });

  it("derives only actions supported by the real permission and account combination", () => {
    expect(deriveWechatPublishingCapability({
      grantedScopes: ["wechat_func_11"],
      providerMetadata: { verified: false, serviceType: 1 },
      features: allFeatures
    })).toMatchObject({ canCreateDraft: true, canSubmitPublish: false });

    expect(deriveWechatPublishingCapability({
      grantedScopes: ["wechat_func_7", "wechat_func_100"],
      providerMetadata: { verified: true, serviceType: 2 },
      features: allFeatures
    })).toEqual({
      canCreateDraft: true,
      canSubmitPublish: true,
      blockers: [],
      verified: true,
      serviceType: 2
    });
  });

  it("builds one approved HTML snapshot and rejects current WeChat limit violations", async () => {
    const snapshot = buildWechatPublicationSnapshot({
      output,
      outputUpdatedAt: "2026-08-26T12:00:00.000Z"
    });
    expect(snapshot.contentHtml).toContain("<h2");
    expect(snapshot.contentHtml).toContain(output.visualAssets![0].imageUrl);
    expect(snapshot.inlineImageUrls).toEqual([output.visualAssets![0].imageUrl]);
    expect(validateWechatPublicationSnapshot(snapshot)).toEqual({ ok: true });
    expect(validateWechatPublicationSnapshot({ ...snapshot, title: "长".repeat(33) })).toMatchObject({
      ok: false,
      code: "invalid_title"
    });
    expect(validateWechatPublicationSnapshot({ ...snapshot, coverImageUrl: "" })).toMatchObject({
      ok: false,
      code: "missing_cover"
    });
    await expect(fingerprintWechatPublicationSnapshot(snapshot)).resolves.not.toBe(
      await fingerprintWechatPublicationSnapshot({ ...snapshot, summary: `${snapshot.summary}更新` })
    );
  });

  it("does not call a provider success final until a real article URL exists", () => {
    expect(mapWechatProviderPublicationStatus({ status: 0, articleUrl: null })).toBe("publishing");
    expect(mapWechatProviderPublicationStatus({ status: 0, articleUrl: "https://mp.weixin.qq.com/s/article" })).toBe("published");
    expect(mapWechatProviderPublicationStatus({ status: 4, articleUrl: null })).toBe("blocked");
    expect(mapWechatProviderPublicationStatus({ status: 5, articleUrl: null })).toBe("removed");
  });
});
