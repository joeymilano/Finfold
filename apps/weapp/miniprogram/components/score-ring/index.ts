/** 匹配度环：canvas 2d 绘制，金环 + 中心分数。 */
Component({
  properties: {
    value: { type: Number, value: 0 },
    size: { type: Number, value: 48 },
    color: { type: String, value: "#D9A441" }
  },
  observers: {
    "value,color": function () {
      this.draw();
    }
  },
  lifetimes: {
    attached() {
      this.draw();
    },
    ready() {
      this.draw();
    }
  },
  methods: {
    draw() {
      this.createSelectorQuery()
        .select("#ring")
        .fields({ node: true, size: true })
        .exec((res) => {
          const entry = res?.[0];
          if (!entry?.node) return;
          const canvas = entry.node as WechatMiniprogram.Canvas;
          const ctx = canvas.getContext("2d");
          const dpr = wx.getSystemInfoSync().pixelRatio || 2;
          const size = entry.width || Number(this.data.size) || 48;
          canvas.width = size * dpr;
          canvas.height = size * dpr;
          ctx.scale(dpr, dpr);
          ctx.clearRect(0, 0, size, size);

          const lineWidth = Math.max(3, size / 18);
          const radius = (size - lineWidth) / 2;
          const center = size / 2;

          ctx.beginPath();
          ctx.arc(center, center, radius, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(255,255,255,0.07)";
          ctx.lineWidth = lineWidth;
          ctx.stroke();

          const clamped = Math.max(0, Math.min(100, Number(this.data.value) || 0));
          if (clamped > 0) {
            ctx.beginPath();
            ctx.arc(center, center, radius, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * clamped) / 100);
            ctx.strokeStyle = String(this.data.color) || "#D9A441";
            ctx.lineCap = "round";
            ctx.lineWidth = lineWidth;
            ctx.stroke();
          }

          ctx.fillStyle = String(this.data.color) || "#D9A441";
          ctx.font = `600 ${Math.round(size / 2.6)}px Georgia, "Songti SC", "Noto Serif SC", serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(Math.round(clamped)), center, center + 1);
        });
    }
  }
});
