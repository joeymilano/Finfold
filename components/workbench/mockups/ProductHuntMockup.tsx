import { Award, ChevronUp, MoreHorizontal } from "@/components/ui/icons";
import type { Locale } from "@/lib/i18n";

export function ProductHuntMockup({ title, body, cta, notes, imageUrl, locale }: { title: string; body: string; cta: string; notes: string; imageUrl?: string; locale: Locale }) {
  return (
    <div className="flex flex-col bg-white">
      {/* Nav */}
      <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2.5 text-xs font-semibold text-slate-700">
        <span className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#DA552F] text-[11px] font-bold text-white">P</span>
          <span className="text-slate-900">Product Hunt</span>
        </span>
        <MoreHorizontal className="h-4 w-4 text-slate-500" />
      </div>

      <div className="px-4 py-4">
        {/* Product header */}
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#DA552F] to-amber-500 text-lg font-black text-white shadow-sm">G</div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-900">{locale === "zh" ? "增长笔记" : "Growth Notes"}</p>
            {/* Tagline = title */}
            <p className="text-[13px] leading-snug text-slate-600">{title}</p>
          </div>
          {/* Upvote button */}
          <div className="flex flex-col items-center justify-center rounded-lg border border-[#DA552F] px-2.5 py-1 text-[#DA552F]">
            <ChevronUp className="h-4 w-4" />
            <span className="text-xs font-bold">1.2K</span>
          </div>
        </div>

        {/* Topic pills */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(locale === "zh" ? ["市场营销", "人工智能", "SaaS"] : ["Marketing", "Artificial Intelligence", "SaaS"]).map((t) => (
            <span key={t} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">{t}</span>
          ))}
        </div>

        {/* AI-generated cover image */}
        {imageUrl && (
          <div className="mt-3 aspect-video overflow-hidden rounded-xl border border-slate-100">
            <img
              src={imageUrl}
              alt={title}
              className="h-full w-full object-cover"
              loading="lazy"
              onError={(e) => { (e.currentTarget.parentElement as HTMLElement | null)?.style.setProperty("display", "none"); }}
            />
          </div>
        )}

        {/* Maker comment */}
        <div className="mt-3.5 rounded-xl border border-slate-100 bg-slate-50 p-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-[#DA552F]">
            <Award className="h-3.5 w-3.5" /> {locale === "zh" ? "创始人评论" : "MAKER COMMENT"}
          </div>
          <div className="max-h-56 overflow-y-auto whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">{body}</div>
        </div>

        {cta && <p className="mt-3 text-[13px] font-semibold text-[#DA552F]">{cta}</p>}

        {notes && (
          <p className="mt-3 rounded-lg border border-slate-100 bg-white p-2.5 text-[11px] leading-normal text-slate-400">{notes}</p>
        )}
      </div>
    </div>
  );
}
