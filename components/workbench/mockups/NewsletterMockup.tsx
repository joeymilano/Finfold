import { Bookmark } from "@/components/ui/icons";
import type { Locale } from "@/lib/i18n";

export function NewsletterMockup({ title, body, cta, imageUrl, locale }: { title: string; body: string; cta: string; imageUrl?: string; locale: Locale }) {
  return (
    <div className="flex flex-col bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2.5 text-xs font-semibold text-slate-700">
        <span className="font-serif text-base font-bold text-slate-900">M</span>
        <span className="text-slate-500">{locale === "zh" ? "文章" : "Story"}</span>
        <Bookmark className="h-4 w-4 text-slate-500" />
      </div>

      <div className="max-h-[440px] overflow-y-auto px-5 py-5">
        <h1 className="font-serif text-2xl font-bold leading-tight text-slate-900">{title}</h1>
        <div className="mt-3 flex items-center gap-2.5 border-b border-slate-100 pb-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">GN</div>
          <div className="text-xs leading-tight">
            <p className="font-semibold text-slate-800">{locale === "zh" ? "增长笔记" : "Growth Notes"}</p>
            <p className="text-slate-400">{locale === "zh" ? "阅读约 6 分钟 · 刚刚" : "6 min read · Just now"}</p>
          </div>
        </div>
        <div className="mt-4 whitespace-pre-wrap font-serif text-[15px] leading-7 text-slate-800">{body}</div>

        {/* AI-generated cover image */}
        {imageUrl && (
          <div className="mt-4 aspect-video overflow-hidden rounded-lg border border-slate-100">
            <img
              src={imageUrl}
              alt={title}
              className="h-full w-full object-cover"
              loading="lazy"
              onError={(e) => { (e.currentTarget.parentElement as HTMLElement | null)?.style.setProperty("display", "none"); }}
            />
          </div>
        )}

        {cta && <p className="mt-4 font-serif text-[15px] font-semibold text-emerald-700">{cta}</p>}
      </div>
    </div>
  );
}
