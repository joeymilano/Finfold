import { Heart, MessageCircle, MoreHorizontal, Repeat2, Send } from "@/components/ui/icons";
import type { Locale } from "@/lib/i18n";

export function ThreadsMockup({ body, cta, imageUrl, locale }: { body: string; cta: string; imageUrl?: string; locale: Locale }) {
  return (
    <div className="flex flex-col bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2.5 text-xs font-semibold text-slate-700">
        <span className="text-slate-400">←</span>
        <span className="font-bold text-slate-900">{locale === "zh" ? "串文" : "Thread"}</span>
        <MoreHorizontal className="h-4 w-4 text-slate-500" />
      </div>
      <div className="px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">@</div>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-slate-900">growthnotes</p>
            <p className="text-[11px] text-slate-400">{locale === "zh" ? "刚刚" : "Just now"}</p>
          </div>
        </div>
        <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-900">{body}</div>

        {/* AI-generated cover image */}
        {imageUrl && (
          <div className="mt-3 aspect-[4/3] overflow-hidden rounded-xl border border-slate-100">
            <img
              src={imageUrl}
              alt="Post image"
              className="h-full w-full object-cover"
              loading="lazy"
              onError={(e) => { (e.currentTarget.parentElement as HTMLElement | null)?.style.setProperty("display", "none"); }}
            />
          </div>
        )}

        {cta && <p className="mt-3 text-sm font-semibold text-slate-600">{cta}</p>}
        <div className="mt-4 flex items-center gap-5 text-slate-400">
          <Heart className="h-5 w-5" />
          <MessageCircle className="h-5 w-5" />
          <Repeat2 className="h-5 w-5" />
          <Send className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
