import { ArrowBigDown, ArrowBigUp, Bookmark, MessageCircle, MoreHorizontal, Share2 } from "@/components/ui/icons";
import type { Locale } from "@/lib/i18n";

export function RedditMockup({ platform, title, body, cta, notes, imageUrl, locale }: { platform: string; title: string; body: string; cta: string; notes: string; imageUrl?: string; locale: Locale }) {
  const meta =
    platform === "hacker-news"
      ? { brand: "Hacker News", accent: "#FF6600", sub: "news.ycombinator.com", tag: locale === "zh" ? "展示 HN" : "Show HN" }
      : platform === "indie-hackers"
        ? { brand: "Indie Hackers", accent: "#0E2439", sub: "indiehackers.com", tag: locale === "zh" ? "里程碑" : "Milestone" }
        : { brand: "Reddit", accent: "#FF4500", sub: "r/SideProject", tag: locale === "zh" ? "讨论" : "Discussion" };

  return (
    <div className="flex flex-col bg-white">
      {/* Nav */}
      <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2.5 text-xs font-semibold text-slate-700">
        <span className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: meta.accent }}>
            {platform === "hacker-news" ? "Y" : platform === "indie-hackers" ? "IH" : "r"}
          </span>
          <span className="text-slate-900">{meta.sub}</span>
        </span>
        <MoreHorizontal className="h-4 w-4 text-slate-500" />
      </div>

      <div className="flex min-w-0 gap-2.5 px-3 py-3.5">
        {/* Vote rail */}
        <div className="flex flex-col items-center gap-0.5 pt-0.5 text-slate-400">
          <ArrowBigUp className="h-5 w-5" style={{ color: meta.accent }} />
          <span className="text-xs font-bold text-slate-700">2.4k</span>
          <ArrowBigDown className="h-5 w-5" />
        </div>

        {/* Body column */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: meta.accent }}>{meta.tag}</span>
            <span>{locale === "zh" ? "由 u/growth_notes 发布 · 1 小时前" : "Posted by u/growth_notes · 1h"}</span>
          </div>

          <h3 dir="auto" className="mt-2 text-start text-sm font-bold leading-snug text-slate-900">{title}</h3>

          <div dir="auto" className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap text-start text-[13px] leading-relaxed text-slate-700">{body}</div>

          {imageUrl && (
            <div className="mt-2.5 aspect-video overflow-hidden rounded-lg border border-slate-100">
              <img
                src={imageUrl}
                alt={title}
                className="h-full w-full object-cover"
                loading="lazy"
                onError={(e) => { (e.currentTarget.parentElement as HTMLElement | null)?.style.setProperty("display", "none"); }}
              />
            </div>
          )}

          {cta && <p dir="auto" className="mt-2.5 text-start text-[13px] font-semibold italic text-slate-600">{cta}</p>}

          {notes && (
            <p className="mt-2.5 rounded border border-slate-100 bg-slate-50 p-2 text-[11px] leading-normal text-slate-400">{notes}</p>
          )}

          {/* Action row */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-semibold text-slate-500">
            <span className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" /> 184 {locale === "zh" ? "条评论" : "Comments"}</span>
            <span className="flex items-center gap-1"><Share2 className="h-3.5 w-3.5" /> {locale === "zh" ? "分享" : "Share"}</span>
            <span className="flex items-center gap-1"><Bookmark className="h-3.5 w-3.5" /> {locale === "zh" ? "保存" : "Save"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
