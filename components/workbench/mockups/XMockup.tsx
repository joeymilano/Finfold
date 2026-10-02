import { Globe, Heart, MessageSquare, MoreHorizontal, Send, Share2 } from "@/components/ui/icons";
import type { Locale } from "@/lib/i18n";

export function XMockup({ body, cta, notes, imageUrl, locale }: { body: string; cta: string; notes: string; imageUrl?: string; locale: Locale }) {
  return (
    <div className="flex flex-col bg-white">
      {/* Twitter simulated nav */}
      <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2.5 text-xs text-slate-800 font-semibold">
        <span className="text-slate-400">{locale === "zh" ? "返回" : "Back"}</span>
        <span className="text-slate-900 font-bold">{locale === "zh" ? "帖子" : "Post"}</span>
        <Globe className="h-4 w-4 text-slate-500" />
      </div>

      <div className="p-4.5">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-slate-950 flex items-center justify-center text-white text-xs font-extrabold shadow-sm">
              X
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-slate-950 leading-none">{locale === "zh" ? "增长笔记" : "Growth Notes"}</span>
                <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-sky-500 text-[8px] text-white">✓</span>
              </div>
              <p className="text-xs text-slate-500">@growthnotes · {locale === "zh" ? "刚刚" : "Just now"}</p>
            </div>
          </div>
          <MoreHorizontal className="h-4 w-4 text-slate-400" />
        </div>

        {/* Content body */}
        <div dir="auto" className="mt-3 whitespace-pre-wrap text-start text-sm leading-relaxed text-slate-900">
          {body}
        </div>

        {/* AI-generated cover image */}
        {imageUrl && (
          <div className="mt-3 aspect-video overflow-hidden rounded-2xl border border-slate-200">
            <img
              src={imageUrl}
              alt="Post image"
              className="h-full w-full object-cover"
              loading="lazy"
              onError={(e) => { (e.currentTarget.parentElement as HTMLElement | null)?.style.setProperty("display", "none"); }}
            />
          </div>
        )}

        {cta && (
          <p dir="auto" className="mt-3.5 text-start text-sm font-semibold text-indigo-600 underline decoration-indigo-200 underline-offset-4 decoration-2">
            {cta}
          </p>
        )}

        {notes && (
          <p className="mt-3.5 rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs leading-normal text-slate-500">
            {notes}
          </p>
        )}

        {/* Engagement metrics */}
        <div className="mt-4 border-y border-slate-100 py-3 flex items-center gap-5 text-xs text-slate-500 font-medium">
          <span><strong className="text-slate-950">1,240</strong> {locale === "zh" ? "浏览" : "Views"}</span>
          <span><strong className="text-slate-950">84</strong> {locale === "zh" ? "喜欢" : "Likes"}</span>
          <span><strong className="text-slate-950">12</strong> {locale === "zh" ? "转发" : "Reposts"}</span>
        </div>

        {/* Action icons */}
        <div className="mt-3 flex items-center justify-between text-slate-400 px-2">
          <MessageSquare className="h-4.5 w-4.5 hover:text-sky-500 cursor-pointer" />
          <Share2 className="h-4.5 w-4.5 hover:text-emerald-500 cursor-pointer" />
          <Heart className="h-4.5 w-4.5 hover:text-rose-500 cursor-pointer" />
          <Send className="h-4.5 w-4.5 hover:text-sky-500 cursor-pointer" />
        </div>
      </div>
    </div>
  );
}
