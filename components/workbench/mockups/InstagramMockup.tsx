import { Bookmark, Heart, MessageCircle, MoreHorizontal, Send } from "@/components/ui/icons";
import type { Locale } from "@/lib/i18n";

/**
 * Instagram preview — visual-first. The image is the hero (square feed frame),
 * the caption lives below with the handle, and the action row is Instagram's
 * signature heart / comment / share + bookmark (save). Captures the
 * "...more" fold on the caption and the aspirational aesthetic.
 */
export function InstagramMockup({ body, cta, notes, imageUrl, locale }: { body: string; cta: string; notes: string; imageUrl?: string; locale: Locale }) {
  return (
    <div className="flex flex-col bg-white">
      {/* Instagram top bar — gradient avatar ring + handle */}
      <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="rounded-full bg-gradient-to-tr from-[#FEDA77] via-[#DD2A7B] to-[#515BD4] p-[2px]">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-[8px] font-extrabold text-slate-900">GN</div>
          </div>
          <div className="flex items-center gap-1 leading-none">
            <span className="text-sm font-semibold text-slate-900">growthnotes</span>
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-[#0095F6]" aria-hidden="true">
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
            </svg>
          </div>
        </div>
        <MoreHorizontal className="h-4 w-4 text-slate-500" />
      </div>

      {/* Visual-first hero — square image, or gradient placeholder */}
      {imageUrl ? (
        <div className="aspect-square w-full overflow-hidden bg-slate-100">
          <img src={imageUrl} alt="Post image" className="h-full w-full object-cover" loading="lazy" />
        </div>
      ) : (
        <div className="aspect-square w-full bg-gradient-to-tr from-[#FEDA77] via-[#DD2A7B] to-[#515BD4]" />
      )}

      {/* Action row — Instagram signature: heart / comment / share … bookmark (save) */}
      <div className="flex items-center justify-between px-3.5 pt-3 text-slate-800">
        <div className="flex items-center gap-4">
          <Heart className="h-5 w-5 hover:text-rose-500 cursor-pointer" />
          <MessageCircle className="h-5 w-5 hover:text-slate-500 cursor-pointer" />
          <Send className="h-5 w-5 hover:text-sky-500 cursor-pointer" />
        </div>
        <Bookmark className="h-5 w-5 hover:text-slate-900 cursor-pointer" />
      </div>

      {/* Likes + caption */}
      <div className="px-3.5 pt-2.5">
        <p className="text-xs font-semibold text-slate-900">{locale === "zh" ? "2,481 个赞" : "2,481 likes"}</p>
        <div className="mt-1.5 text-sm leading-relaxed text-slate-900 whitespace-pre-wrap">
          <span className="font-semibold">growthnotes</span>{" "}
          <span dir="auto" className="text-start text-slate-800">{body}</span>
        </div>

        {cta && (
          <p dir="auto" className="mt-2 text-start text-sm font-semibold text-[#00376b]">{cta}</p>
        )}

        {notes && (
          <p className="mt-2.5 rounded-lg border border-slate-100 bg-slate-50 p-2.5 text-xs leading-normal text-slate-500">{notes}</p>
        )}

        <p className="mt-2.5 text-[10px] uppercase tracking-wide text-slate-400">{locale === "zh" ? "查看翻译" : "View translation"}</p>
        <p className="mt-1 pb-3 text-[10px] text-slate-400">{locale === "zh" ? "2 小时前" : "2 HOURS AGO"}</p>
      </div>
    </div>
  );
}
