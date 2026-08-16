import { MessageCircle, MoreHorizontal, Share2, Star, ThumbsUp } from "@/components/ui/icons";
import { PlatformGlyph } from "@/components/workbench/PlatformBrandIcon";
import type { Locale } from "@/lib/i18n";

export function ZhihuMockup({
  title,
  body,
  cta,
  notes,
  imageUrl,
  locale
}: {
  title: string;
  body: string;
  cta: string;
  notes: string;
  imageUrl?: string;
  locale: Locale;
}) {
  return (
    <div className="flex flex-col bg-[#f6f6f6]">
      <div className="flex items-center justify-between border-b border-slate-100 bg-white px-3.5 py-2.5">
        <div className="flex items-center gap-2 text-sm font-bold text-[#0066ff]">
          <PlatformGlyph platform="zhihu" className="h-5 w-5" />
          <span>知乎</span>
        </div>
        <span className="text-[11px] text-slate-400">{locale === "en" ? "Answer preview" : "回答预览"}</span>
        <MoreHorizontal className="h-4 w-4 text-slate-500" />
      </div>

      <div className="max-h-[500px] overflow-y-auto bg-white px-4 py-4">
        <h1 className="text-lg font-bold leading-snug text-slate-950">{title}</h1>

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[#0066ff] text-xs font-black text-white">知</div>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-xs font-semibold text-slate-900">{locale === "en" ? "Growth Notes" : "增长笔记"}</p>
              <p className="mt-0.5 text-[10px] text-slate-400">{locale === "en" ? "Shares practical product lessons" : "分享产品实践与复盘"}</p>
            </div>
          </div>
          <button type="button" className="rounded border border-[#0066ff] px-3 py-1 text-[11px] font-semibold text-[#0066ff]">
            {locale === "en" ? "Follow" : "关注"}
          </button>
        </div>

        <div className="mt-4 whitespace-pre-wrap text-[14px] leading-7 text-slate-800">{body}</div>

        {imageUrl ? (
          <div className="mt-4 aspect-video overflow-hidden rounded border border-slate-100 bg-slate-50">
            <img src={imageUrl} alt={title} className="h-full w-full object-cover" loading="lazy" />
          </div>
        ) : null}

        {cta ? (
          <p className="mt-4 border-l-2 border-[#0066ff] bg-[#f4f8ff] px-3 py-2 text-sm leading-6 text-slate-700">{cta}</p>
        ) : null}

        {notes ? (
          <div className="mt-4 rounded border border-[#dbe9ff] bg-[#f7faff] p-3 text-[11px] leading-5 text-slate-500">
            <p className="font-semibold text-[#175199]">{locale === "en" ? "Before publishing" : "发布前检查"}</p>
            <p className="mt-1">{notes}</p>
          </div>
        ) : null}

        <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] text-slate-500">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-[#0066ff]"><ThumbsUp className="h-3.5 w-3.5" />{locale === "en" ? "Upvote" : "赞同"}</span>
            <span className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" />{locale === "en" ? "Discuss" : "评论"}</span>
          </div>
          <div className="flex items-center gap-3">
            <Star className="h-3.5 w-3.5" />
            <Share2 className="h-3.5 w-3.5" />
          </div>
        </div>
      </div>
    </div>
  );
}
