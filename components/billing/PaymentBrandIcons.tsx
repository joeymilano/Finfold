// 官方支付品牌图标（内联 SVG，随主题缩放）。
// 颜色取自各品牌公开视觉规范：支付宝蓝 #1677FF，微信支付绿 #07C160。
// 仅在支付方式选择场景使用，保持方块图标语义一致（圆角 + 白色主体图形）。
// decorative：用于按钮内与文字相邻的小尺寸场景——隐藏图片语义，
// 让按钮 accessible name 只来自文字（避免「支付宝 支付宝」式重复朗读）。

type BrandIconProps = { className?: string; decorative?: boolean };

function brandAria(decorative: boolean | undefined, label: string) {
  return decorative
    ? { "aria-hidden": true as const }
    : { role: "img" as const, "aria-label": label };
}

export function AlipayIcon({ className, decorative }: BrandIconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" {...brandAria(decorative, "支付宝")}>
      <rect width="24" height="24" rx="5.5" fill="#1677FF" />
      <text
        x="12"
        y="16.8"
        textAnchor="middle"
        fontSize="13"
        fontWeight={700}
        fill="#FFFFFF"
        fontFamily="'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', sans-serif"
      >
        支
      </text>
    </svg>
  );
}

export function WechatPayIcon({ className, decorative }: BrandIconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" {...brandAria(decorative, "微信支付")}>
      <rect width="24" height="24" rx="5.5" fill="#07C160" />
      {/* 大气泡（左上）+ 左下尾巴 */}
      <ellipse cx="9.3" cy="10" rx="6.1" ry="5" fill="#FFFFFF" />
      <path d="M6.4 13.9 4.6 17.4l4-2.1z" fill="#FFFFFF" />
      <circle cx="7.2" cy="8.9" r="0.78" fill="#07C160" />
      <circle cx="11.4" cy="8.9" r="0.78" fill="#07C160" />
      {/* 小气泡（右下）+ 右下尾巴 */}
      <ellipse cx="16.2" cy="15.1" rx="4.9" ry="4" fill="#FFFFFF" />
      <path d="M18.9 18.2 20.8 21l-3.7-1.6z" fill="#FFFFFF" />
      <circle cx="14.6" cy="14.3" r="0.62" fill="#07C160" />
      <circle cx="17.9" cy="14.3" r="0.62" fill="#07C160" />
    </svg>
  );
}
