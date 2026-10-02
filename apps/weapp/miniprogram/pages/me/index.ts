import { api } from "../../utils/api";
import { getFinfoldApp } from "../../utils/global-data";

const app = getFinfoldApp();

Page({
  data: {
    creditsText: "…",
    business: "",
    audience: "",
    keywordsText: "",
    platform: "wechat" as "wechat" | "xiaohongshu" | "moments",
    saving: false
  },

  onShow() {
    this.loadMe();
  },

  async loadMe() {
    try {
      const me = await api.getMe();
      this.setData({
        creditsText: String(me.credits),
        business: me.business ?? "",
        audience: me.audience ?? "",
        keywordsText: (me.focusKeywords ?? []).join("，"),
        platform: me.platform === "xiaohongshu" ? "xiaohongshu" : me.platform === "moments" ? "moments" : "wechat"
      });
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "加载失败", icon: "none" });
    }
  },

  onBusinessInput(event: WechatMiniprogram.CustomEvent) {
    this.setData({ business: String(event.detail.value || "") });
  },

  onAudienceInput(event: WechatMiniprogram.CustomEvent) {
    this.setData({ audience: String(event.detail.value || "") });
  },

  onKeywordsInput(event: WechatMiniprogram.CustomEvent) {
    this.setData({ keywordsText: String(event.detail.value || "") });
  },

  onPlatformChip(event: WechatMiniprogram.TouchEvent) {
    this.setData({ platform: event.currentTarget.dataset.platform as "wechat" });
  },

  async saveProfile() {
    if (this.data.saving) return;
    this.setData({ saving: true });
    try {
      await api.patchMe({
        business: this.data.business.trim() || undefined,
        audience: this.data.audience.trim() || undefined,
        focusKeywords: this.data.keywordsText
          .split(/[,，、\s]+/)
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 12),
        platform: this.data.platform
      });
      app.globalData.profileDirty = true;
      wx.showToast({ title: "画像已更新", icon: "success" });
      this.loadMe();
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "保存失败", icon: "none" });
    } finally {
      this.setData({ saving: false });
    }
  }
});
