import { api, type DraftSnapshot } from "../../utils/api";
import { getFinfoldApp, type PendingDraft } from "../../utils/global-data";
import { platformLabel, timeAgo } from "../../utils/format";

const app = getFinfoldApp();
const POLL_INTERVAL_MS = 2500;
const MAX_POLLS = 48; // 2 分钟后由服务端超时兜底

type HistoryItem = {
  id: string;
  title: string;
  platformText: string;
  dotClass: string;
  statusText: string;
  timeAgoText: string;
  content: string;
  expanded: boolean;
};

const PLATFORM_DOT: Record<string, string> = {
  wechat: "dot-rising",
  xiaohongshu: "dot-hot",
  moments: "dot-new"
};

Page({
  data: {
    formTitle: "",
    formFact: "",
    platform: "wechat" as "wechat" | "xiaohongshu" | "moments",
    platformText: "公众号",
    generating: false,
    currentDraft: null as DraftSnapshot | null,
    creditsText: "…",
    history: [] as HistoryItem[]
  },

  pendingSource: "free" as PendingDraft["source"],
  pendingOpportunityId: undefined as string | undefined,
  pollTimer: 0,
  pollCount: 0,

  onLoad() {
    this.consumePendingDraft();
  },

  onShow() {
    if (this.consumePendingDraft()) return;
    this.refreshCredits();
    this.refreshHistory();
  },

  onHide() {
    this.stopPolling();
  },

  onUnload() {
    this.stopPolling();
  },

  /** 雷达/详情页 switchTab 过来的待生成选题；返回 true 表示本次已消费。 */
  consumePendingDraft(): boolean {
    const pending = app.globalData.pendingDraft;
    if (!pending) return false;
    app.globalData.pendingDraft = null;
    this.pendingSource = pending.source;
    this.pendingOpportunityId = pending.opportunityId;
    this.setData({
      formTitle: pending.topic.title,
      formFact: pending.topic.fact ?? "",
      platform: pending.platform,
      platformText: platformLabel(pending.platform)
    });
    return true;
  },

  async refreshCredits() {
    try {
      const me = await api.getMe();
      this.setData({ creditsText: String(me.credits) });
    } catch {
      this.setData({ creditsText: "—" });
    }
  },

  async refreshHistory() {
    try {
      const { drafts } = await api.listDrafts();
      this.setData({
        history: drafts.slice(0, 10).map((item) => ({
          id: item.id,
          title: item.title || "（未命名选题）",
          platformText: platformLabel(item.platform),
          dotClass: PLATFORM_DOT[item.platform] ?? "dot-cool",
          statusText: item.status === "ready" ? "已完成" : item.status === "pending" ? "生成中" : "失败",
          timeAgoText: timeAgo(item.createdAt),
          content: item.content ?? "",
          expanded: false
        }))
      });
    } catch {
      /* 历史加载失败不打断主流程 */
    }
  },

  onTitleInput(event: WechatMiniprogram.CustomEvent) {
    this.setData({ formTitle: String(event.detail.value || "") });
  },

  onFactInput(event: WechatMiniprogram.CustomEvent) {
    this.setData({ formFact: String(event.detail.value || "") });
  },

  onPlatformChip(event: WechatMiniprogram.TouchEvent) {
    const platform = event.currentTarget.dataset.platform as "wechat" | "xiaohongshu" | "moments";
    this.setData({ platform, platformText: platformLabel(platform) });
  },

  async generate() {
    const title = this.data.formTitle.trim();
    if (title.length < 2 || this.data.generating) return;
    this.setData({ generating: true, currentDraft: null });
    try {
      const created = await api.createDraft({
        source: this.pendingOpportunityId ? "opportunity" : "free",
        opportunityId: this.pendingOpportunityId,
        platform: this.data.platform,
        topic: {
          title,
          fact: this.data.formFact.trim() || undefined,
          angle: undefined
        }
      });
      this.setData({ creditsText: String(created.available) });
      this.startPolling(created.id);
    } catch (error) {
      this.setData({ generating: false });
      wx.showToast({ title: error instanceof Error ? error.message : "创建失败", icon: "none", duration: 3000 });
    }
  },

  startPolling(id: string) {
    this.stopPolling();
    this.pollCount = 0;
    const tick = async () => {
      this.pollCount += 1;
      try {
        const draft = await api.getDraft(id);
        if (draft.status !== "pending") {
          this.setData({ generating: false, currentDraft: draft });
          if (typeof draft.available === "number") {
            this.setData({ creditsText: String(draft.available) });
          }
          this.refreshHistory();
          if (draft.status === "ready") {
            wx.vibrateShort({ type: "light" });
          }
          return;
        }
      } catch (error) {
        this.setData({ generating: false });
        wx.showToast({ title: error instanceof Error ? error.message : "查询失败", icon: "none" });
        return;
      }
      if (this.pollCount >= MAX_POLLS) {
        this.setData({ generating: false });
        wx.showToast({ title: "生成时间较长，稍后在历史里查看", icon: "none" });
        return;
      }
      this.pollTimer = setTimeout(tick, POLL_INTERVAL_MS) as unknown as number;
    };
    this.pollTimer = setTimeout(tick, POLL_INTERVAL_MS) as unknown as number;
  },

  stopPolling() {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = 0;
    }
  },

  copyContent() {
    const content = this.data.currentDraft?.content;
    if (!content) return;
    wx.setClipboardData({ data: content });
  },

  toggleHistory(event: WechatMiniprogram.TouchEvent) {
    const index = Number(event.currentTarget.dataset.index);
    const key = `history[${index}].expanded`;
    this.setData({ [key]: !this.data.history[index].expanded } as Record<string, boolean>);
  }
});
