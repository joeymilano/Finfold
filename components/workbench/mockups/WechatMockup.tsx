import { MoreHorizontal, Share2, Star, ThumbsUp } from "@/components/ui/icons";
import type { Locale } from "@/lib/i18n";

export function WechatMockup({ title, body, cta, notes, imageUrl, locale }: { title: string; body: string; cta: string; notes: string; imageUrl?: string; locale: Locale }) {
  return (
    <div className="flex flex-col bg-white">
      {/* WeChat article nav */}
      <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2.5 text-xs font-semibold text-slate-800">
        <span className="text-slate-400">✕</span>
        <span className="font-bold text-slate-900">公众号文章</span>
        <MoreHorizontal className="h-4 w-4 text-slate-700" />
      </div>

      <div className="max-h-[460px] overflow-y-auto px-4 py-4">
        {/* Article title */}
        <h1 className="text-lg font-bold leading-snug text-slate-900">{title}</h1>

        {/* Account row */}
        <div className="mt-3 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-[#07C160] text-xs font-bold text-white">公</div>
          <div className="leading-tight">
            <p className="text-xs font-medium text-[#576B95]">增长笔记</p>
            <p className="text-[10px] text-slate-400">{locale === "zh" ? "刚刚 · 北京" : "Just now · Beijing"}</p>
          </div>
        </div>

        {/* Article body */}
        <div className="mt-4 whitespace-pre-wrap text-[15px] leading-7 text-slate-800">{body}</div>

        {/* AI-generated cover image */}
        {imageUrl && (
          <div className="mt-4 aspect-[4/3] overflow-hidden rounded-lg border border-slate-100">
            <img
              src={imageUrl}
              alt={title}
              className="h-full w-full object-cover"
              loading="lazy"
              onError={(e) => { (e.currentTarget.parentElement as HTMLElement | null)?.style.setProperty("display", "none"); }}
            />
          </div>
        )}

        {cta && (
          <div className="mt-4 rounded-lg bg-[#07C160]/10 p-3 text-sm font-semibold text-[#07A152]">{cta}</div>
        )}

        {notes && (
          <p className="mt-4 rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs leading-normal text-slate-500">{notes}</p>
        )}

        {/* Footer actions */}
        <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-400">
          <span className="flex items-center gap-1.5"><ThumbsUp className="h-4 w-4" /> 赞</span>
          <span className="flex items-center gap-1.5"><Star className="h-4 w-4" /> 在看</span>
          <span className="flex items-center gap-1.5"><Share2 className="h-4 w-4" /> 分享</span>
        </div>
      </div>
    </div>
  );
}
