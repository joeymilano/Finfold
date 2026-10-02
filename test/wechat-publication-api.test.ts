import { describe, expect, it, vi } from "vitest";
import {
  addWechatArticleDraft,
  fetchWechatPublicationStatus,
  findRecentWechatArticleDraft,
  submitWechatArticleForPublication,
  uploadWechatArticleImage,
  uploadWechatCoverMaterial
} from "@/lib/wechat-component";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("WeChat publishing API adapter", () => {
  it("uploads body and cover images to the distinct official endpoints", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(init?.body).toBeInstanceOf(FormData);
      const url = String(input);
      return url.includes("/media/uploadimg")
        ? jsonResponse({ url: "https://mmbiz.qpic.cn/body.jpg" })
        : jsonResponse({ media_id: "cover-media-id", url: "https://mmbiz.qpic.cn/cover.jpg" });
    });
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff]);
    await expect(uploadWechatArticleImage("token", jpeg, "image/jpeg", fetcher)).resolves.toBe("https://mmbiz.qpic.cn/body.jpg");
    await expect(uploadWechatCoverMaterial("token", jpeg, "image/jpeg", fetcher)).resolves.toBe("cover-media-id");
    expect(String(fetcher.mock.calls[0][0])).toContain("/cgi-bin/media/uploadimg?access_token=token");
    expect(String(fetcher.mock.calls[1][0])).toContain("/cgi-bin/material/add_material?access_token=token&type=image");
  });

  it("reuses a matching recent draft before a retry creates another one", async () => {
    const article = { title: "标题", digest: "摘要", content: "<p>正文</p>" };
    await expect(findRecentWechatArticleDraft("token", article, async (_input, init) => {
      expect(JSON.parse(String(init?.body))).toEqual({ offset: 0, count: 5, no_content: 0 });
      return jsonResponse({
        item: [{ media_id: "existing-draft", content: { news_item: [article] } }]
      });
    })).resolves.toBe("existing-draft");
  });

  it("treats submit as accepted only and maps the later official status payload", async () => {
    const draftId = await addWechatArticleDraft("token", {
      title: "标题",
      digest: "摘要",
      content: "<p>正文</p>",
      thumbMediaId: "thumb"
    }, async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.articles[0]).toMatchObject({ article_type: "news", thumb_media_id: "thumb" });
      return jsonResponse({ media_id: "draft-id" });
    });
    expect(draftId).toBe("draft-id");

    await expect(submitWechatArticleForPublication("token", draftId, async (_input, init) => {
      expect(JSON.parse(String(init?.body))).toEqual({ media_id: "draft-id" });
      return jsonResponse({ publish_id: "publish-id" });
    })).resolves.toBe("publish-id");

    await expect(fetchWechatPublicationStatus("token", "publish-id", async () => jsonResponse({
      publish_id: "publish-id",
      publish_status: 0,
      article_id: "article-id",
      article_detail: { item: [{ article_url: "https://mp.weixin.qq.com/s/article-id" }] }
    }))).resolves.toEqual({
      publishId: "publish-id",
      status: 0,
      articleId: "article-id",
      articleUrl: "https://mp.weixin.qq.com/s/article-id"
    });
  });
});
