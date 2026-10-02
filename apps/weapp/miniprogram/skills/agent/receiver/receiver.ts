/**
 * 微信 AI 接力页：从 AI 会话半屏/全屏打开，落到机会详情。
 * 独立分包不能引用主包资源，保持零依赖。
 */
Page({
  data: {
    title: "正在打开机会…"
  },
  onLoad(query: Record<string, string | undefined>) {
    const id = query && query.id ? query.id : "";
    if (id) {
      wx.navigateTo({
        url: `/pages/radar/detail?id=${id}`,
        fail: () => {
          wx.switchTab({ url: "/pages/radar/index" });
        }
      });
      this.setData({ title: "" });
    } else {
      wx.switchTab({ url: "/pages/radar/index" });
    }
  }
});
