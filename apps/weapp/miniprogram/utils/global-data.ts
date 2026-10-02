/** tab 页间传参：雷达页 → 成稿页 的待生成选题，以及画像脏标记。 */

export type PendingDraft = {
  source: "opportunity" | "free";
  opportunityId?: string;
  topic: { title: string; fact?: string; angle?: string; keywords?: string[] };
  platform: "wechat" | "xiaohongshu" | "moments";
};

export type FinfoldGlobalData = {
  pendingDraft: PendingDraft | null;
  profileDirty: boolean;
};

type AppWithData = { globalData: FinfoldGlobalData };

export function getFinfoldApp(): WechatMiniprogram.App.Instance<AppWithData> {
  return getApp<AppWithData>();
}
