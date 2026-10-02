import { CLOUD_ENV } from "./utils/config";
import type { FinfoldGlobalData } from "./utils/global-data";

App<{ globalData: FinfoldGlobalData }>({
  globalData: {
    pendingDraft: null,
    profileDirty: false
  },
  onLaunch() {
    if (!wx.cloud) {
      console.error("[weapp] 当前微信基础库过低，无法使用云能力，请升级微信");
      return;
    }
    wx.cloud.init({ env: CLOUD_ENV, traceUser: true });
  }
});
