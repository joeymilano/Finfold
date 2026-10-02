import { api, type MeProfile, type OpportunityCard } from "../../utils/api";
import { getFinfoldApp } from "../../utils/global-data";
import { lifecycleClass, lifecycleLabel, platformLabel, timeAgo, truncate } from "../../utils/format";

type DisplayCard = OpportunityCard & {
  lifecycleLabel: string;
  lifecycleClass: string;
  timeAgoText: string;
  platformText: string;
  whyNowBrief: string;
};

const app = getFinfoldApp();

Page({
  data: {
    window: "24h" as "4h" | "24h" | "7d",
    cards: [] as DisplayCard[],
    loading: true,
    latestSignalText: "",
    bestLabel: "今日最佳",
    showOnboard: false,
    onboardBusiness: "",
    onboardKeywords: "",
    onboardPlatform: "wechat" as "wechat" | "xiaohongshu" | "moments",
    onboardSaving: false
  },

  onLoad() {
    this.refresh();
  },

  onShow() {
    if (app.globalData.profileDirty) {
      app.globalData.profileDirty = false;
      this.refresh();
    }
  },

  onPullDownRefresh() {
    this.refresh().finally(() => wx.stopPullDownRefresh());
  },

  async refresh() {
    this.setData({ loading: true });
    try {
      const me = await api.getMe().catch(() => null as MeProfile | null);
      const feed = await api.getRadar(this.data.window);
      this.setData({
        showOnboard: Boolean(me && !me.onboarded),
        cards: feed.opportunities.map(toDisplayCard),
        latestSignalText: timeAgo(feed.latestSignalAt),
        bestLabel: this.data.window === "7d" ? "本周最佳" : "今日最佳",
        loading: false
      });
    } catch (error) {
      this.setData({ loading: false, cards: [] });
      wx.showToast({ title: error instanceof Error ? error.message : "加载失败", icon: "none" });
    }
  },

  switchWindow(event: WechatMiniprogram.TouchEvent) {
    const next = event.currentTarget.dataset.window as "4h" | "24h" | "7d";
    if (next === this.data.window) return;
    this.setData({ window: next });
    this.refresh();
  },

  openDetail(event: WechatMiniprogram.TouchEvent) {
    const id = event.currentTarget.dataset.id as string;
    wx.navigateTo({ url: `/pages/radar/detail?id=${id}` });
  },

  quickDraft(event: WechatMiniprogram.TouchEvent) {
    const id = event.currentTarget.dataset.id as string;
    const card = this.data.cards.find((item) => item.id === id);
    if (!card) return;
    app.globalData.pendingDraft = {
      source: "opportunity",
      opportunityId: card.id,
      topic: {
        title: card.title,
        fact: card.fact,
        angle: card.mainAngle,
        keywords: card.keywords
      },
      platform: toWeappPlatform(card.recommendedPlatform)
    };
    wx.switchTab({ url: "/pages/draft/index" });
  },

  /* ============ 画像引导 ============ */

  onBusinessInput(event: WechatMiniprogram.CustomEvent) {
    this.setData({ onboardBusiness: String(event.detail.value || "") });
  },

  onKeywordsInput(event: WechatMiniprogram.CustomEvent) {
    this.setData({ onboardKeywords: String(event.detail.value || "") });
  },

  onPlatformChip(event: WechatMiniprogram.TouchEvent) {
    this.setData({ onboardPlatform: event.currentTarget.dataset.platform as "wechat" });
  },

  async submitOnboard() {
    const business = this.data.onboardBusiness.trim();
    if (business.length < 4 || this.data.onboardSaving) return;
    this.setData({ onboardSaving: true });
    try {
      await api.patchMe({
        business,
        focusKeywords: this.data.onboardKeywords
          .split(/[,，、\s]+/)
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 12),
        platform: this.data.onboardPlatform
      });
      wx.showToast({ title: "画像已就位", icon: "success" });
      await this.refresh();
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "保存失败", icon: "none" });
    } finally {
      this.setData({ onboardSaving: false });
    }
  }
});

function toDisplayCard(card: OpportunityCard): DisplayCard {
  return {
    ...card,
    lifecycleLabel: lifecycleLabel(card.lifecycle),
    lifecycleClass: lifecycleClass(card.lifecycle),
    timeAgoText: timeAgo(card.lastSeenAt),
    platformText: platformLabel(card.recommendedPlatform),
    whyNowBrief: truncate(card.whyNow || card.fact, 64)
  };
}

function toWeappPlatform(recommended: string): "wechat" | "xiaohongshu" | "moments" {
  if (recommended === "xiaohongshu") return "xiaohongshu";
  if (recommended === "moments") return "moments";
  return "wechat";
}
