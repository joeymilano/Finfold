import { MessageCircle, MoreHorizontal, Send, Share2, ThumbsUp } from "@/components/ui/icons";
import type { Locale } from "@/lib/i18n";

/**
 * Facebook preview — a community feed post. Distinct from LinkedIn via
 * Facebook's stacked-reaction emojis row (👍 ❤️ 😆) and the Like / Comment /
 * Share action bar in Facebook blue (#1877F2). Comments are the #1 signal on
 * Facebook, so the count is surfaced next to the reactions.
 */
export function FacebookMockup({ body, cta, notes, imageUrl, locale }: { body: string; cta: string; notes: string; imageUrl?: string; locale: Locale }) {
  return (
    <div className="flex flex-col bg-white">
      {/* Facebook top bar */}
      <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2.5 text-xs font-semibold text-slate-700">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1877F2] text-[10px] font-bold text-white">f</span>
        <span className="text-slate-500">{locale === "zh" ? "动态" : "Feed"}</span>
        <MoreHorizontal className="h-4 w-4 text-slate-500" />
      </div>

      <div className="px-3.5 py-3">
        {/* Author row */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1877F2] text-sm font-bold text-white">GN</div>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-slate-900">{locale === "zh" ? "增长笔记" : "Growth Notes"}</p>
              <p className="text-[11px] text-slate-500">{locale === "zh" ? "创始人 · 刚刚 · 🌐" : "Founder · Just now · 🌐"}</p>
            </div>
          </div>
        </div>

        {/* Post body */}
        <div dir="auto" className="mt-2.5 max-h-72 overflow-y-auto whitespace-pre-wrap text-start text-sm leading-relaxed text-slate-800">{body}</div>

        {cta && <p dir="auto" className="mt-2.5 text-start text-sm font-semibold text-[#1877F2]">{cta}</p>}

        {/* Cover image */}
        {imageUrl && (
          <div className="mt-3 aspect-[4/3] overflow-hidden rounded-lg border border-slate-200">
            <img
              src={imageUrl}
              alt="Post image"
              className="h-full w-full object-cover"
              loading="lazy"
              onError={(e) => { (e.currentTarget.parentElement as HTMLElement | null)?.style.setProperty("display", "none"); }}
            />
          </div>
        )}

        {notes && (
          <p className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-2.5 text-xs leading-normal text-slate-500">{notes}</p>
        )}

        {/* Reaction count — Facebook signature: stacked reaction emojis */}
        <div className="mt-3 flex items-center gap-1.5 border-b border-slate-100 pb-2 text-[11px] text-slate-500">
          <span className="flex -space-x-1">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#1877F2] text-[8px] text-white">👍</span>
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[8px] text-white">❤</span>
          </span>
          <span>{locale === "zh" ? "Sarah 等 312 人" : "Sarah and 312 others"}</span>
          <span className="ml-auto">{locale === "zh" ? "64 条评论 · 28 次分享" : "64 comments · 28 shares"}</span>
        </div>

        {/* Action bar — Like / Comment / Share / Send */}
        <div className="mt-1 flex items-center justify-between px-1 text-xs font-semibold text-slate-500">
          <span className="flex items-center gap-1.5 py-1.5"><ThumbsUp className="h-4 w-4" /> {locale === "zh" ? "赞" : "Like"}</span>
          <span className="flex items-center gap-1.5 py-1.5"><MessageCircle className="h-4 w-4" /> {locale === "zh" ? "评论" : "Comment"}</span>
          <span className="flex items-center gap-1.5 py-1.5"><Share2 className="h-4 w-4" /> {locale === "zh" ? "分享" : "Share"}</span>
          <span className="flex items-center gap-1.5 py-1.5"><Send className="h-4 w-4" /> {locale === "zh" ? "发送" : "Send"}</span>
        </div>
      </div>
    </div>
  );
}
