import { MessageCircle, MoreHorizontal, Repeat2, Send, ThumbsUp } from "@/components/ui/icons";
import type { Locale } from "@/lib/i18n";

export function LinkedInMockup({ body, cta, notes, imageUrl, locale }: { body: string; cta: string; notes: string; imageUrl?: string; locale: Locale }) {
  return (
    <div className="flex flex-col bg-white">
      {/* LinkedIn nav */}
      <div className="flex items-center justify-between border-b border-slate-100 bg-[#F4F2EE] px-3.5 py-2.5 text-xs font-semibold text-slate-700">
        <span className="font-bold text-[#0A66C2]">in</span>
        <span className="text-slate-500">{locale === "zh" ? "动态" : "Feed"}</span>
        <MoreHorizontal className="h-4 w-4 text-slate-500" />
      </div>

      <div className="px-4 py-3.5">
        {/* Author row */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#0A66C2] text-sm font-bold text-white">GN</div>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-slate-900">{locale === "zh" ? "增长笔记 · 主理人" : "Growth Notes"}</p>
              <p className="text-[11px] text-slate-500">{locale === "zh" ? "正在构建 AI 增长工具 · 1 度" : "Building AI growth tooling · 1st"}</p>
              <p className="text-[11px] text-slate-400">{locale === "zh" ? "刚刚 · 🌐" : "Just now · 🌐"}</p>
            </div>
          </div>
          <span className="text-sm font-semibold text-[#0A66C2]">{locale === "zh" ? "+ 关注" : "+ Follow"}</span>
        </div>

        {/* Post body */}
        <div dir="auto" className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap text-start text-sm leading-relaxed text-slate-800">{body}</div>

        {cta && <p dir="auto" className="mt-3 text-start text-sm font-semibold text-[#0A66C2]">{cta}</p>}

        {/* AI-generated cover image */}
        {imageUrl && (
          <div className="mt-3 aspect-video overflow-hidden rounded-lg border border-slate-200">
            <img
              src={imageUrl}
              alt="Post cover"
              className="h-full w-full object-cover"
              loading="lazy"
              onError={(e) => { (e.currentTarget.parentElement as HTMLElement | null)?.style.setProperty("display", "none"); }}
            />
          </div>
        )}

        {notes && (
          <p className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-2.5 text-xs leading-normal text-slate-500">{notes}</p>
        )}

        {/* Reaction count */}
        <div className="mt-3 flex items-center gap-1.5 border-b border-slate-100 pb-2 text-[11px] text-slate-500">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#0A66C2] text-[8px] text-white">👍</span>
          <span>{locale === "zh" ? "Sarah、Mike 等 248 人" : "Sarah, Mike and 248 others"}</span>
          <span className="ml-auto">{locale === "zh" ? "37 条评论" : "37 comments"}</span>
        </div>

        {/* Action bar */}
        <div className="mt-1 flex items-center justify-between px-1 text-xs font-semibold text-slate-500">
          <span className="flex items-center gap-1.5 py-1.5"><ThumbsUp className="h-4 w-4" /> {locale === "zh" ? "赞" : "Like"}</span>
          <span className="flex items-center gap-1.5 py-1.5"><MessageCircle className="h-4 w-4" /> {locale === "zh" ? "评论" : "Comment"}</span>
          <span className="flex items-center gap-1.5 py-1.5"><Repeat2 className="h-4 w-4" /> {locale === "zh" ? "转发" : "Repost"}</span>
          <span className="flex items-center gap-1.5 py-1.5"><Send className="h-4 w-4" /> {locale === "zh" ? "发送" : "Send"}</span>
        </div>
      </div>
    </div>
  );
}
