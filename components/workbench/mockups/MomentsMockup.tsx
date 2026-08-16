import { MoreHorizontal, ThumbsUp } from "@/components/ui/icons";
import type { Locale } from "@/lib/i18n";

export function MomentsMockup({ body, cta, imageUrl, locale }: { body: string; cta: string; imageUrl?: string; locale: Locale }) {
  return (
    <div className="flex flex-col bg-[#EDEDED] text-slate-900 pb-3">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-800 font-semibold">
        <span className="text-slate-400">{locale === "zh" ? "返回" : "Back"}</span>
        <span className="text-slate-900 font-bold">{locale === "zh" ? "详情" : "Detail"}</span>
        <MoreHorizontal className="h-4 w-4 text-slate-700" />
      </div>

      {/* Post Container */}
      <div className="bg-white p-4.5 flex gap-3.5">
        {/* Left Avatar */}
        <div className="h-10 w-10 rounded bg-indigo-600 flex items-center justify-center shrink-0 font-bold text-white text-sm shadow-sm">
          {locale === "zh" ? "我" : "ME"}
        </div>
        {/* Right Area */}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-[#576B95]">{locale === "zh" ? "朋友圈增长记录" : "Moments Growth OS"}</h4>
          <div className="mt-2 text-sm text-slate-950 leading-relaxed whitespace-pre-wrap">
            {body}
          </div>
          {cta && <p className="mt-2 text-sm font-semibold text-[#576B95]">{cta}</p>}

          {/* Cover image or Grid Image placeholder */}
          {imageUrl ? (
            <div className="mt-3 aspect-square w-56 overflow-hidden rounded-sm border border-slate-100">
              <img
                src={imageUrl}
                alt="Post cover"
                className="h-full w-full object-cover"
                loading="lazy"
                onError={(e) => { (e.currentTarget.parentElement as HTMLElement | null)?.style.setProperty("display", "none"); }}
              />
            </div>
          ) : (
          <div className="mt-3 grid grid-cols-3 gap-1.5 w-56">
            <div className="aspect-square rounded-sm bg-gradient-to-br from-indigo-500 to-cyan-400 border border-slate-100 flex items-center justify-center text-[10px] text-white font-bold">{locale === "zh" ? "图片" : "Image"}</div>
            <div className="aspect-square rounded-sm bg-gradient-to-br from-purple-500 to-pink-400 border border-slate-100 flex items-center justify-center text-[10px] text-white font-bold">{locale === "zh" ? "复用" : "Repurpose"}</div>
            <div className="aspect-square rounded-sm bg-gradient-to-br from-emerald-500 to-lime-400 border border-slate-100 flex items-center justify-center text-[10px] text-white font-bold">{locale === "zh" ? "增长" : "Growth"}</div>
          </div>
          )}

          {/* Time & Action Button */}
          <div className="mt-3.5 flex items-center justify-between">
            <span className="text-[11px] text-[#7F7F7F]">{locale === "zh" ? "1 分钟前 · 网页端" : "1 min ago · Web"}</span>
            <span className="rounded bg-[#F7F7F7] px-2 py-0.5 text-xs font-bold text-[#576B95] border border-slate-100 hover:bg-slate-100 cursor-pointer">
              ..
            </span>
          </div>

          {/* Simulated Likes Area */}
          <div className="mt-2.5 rounded-sm bg-[#F7F7F7] p-2 text-xs border border-slate-100">
            <div className="flex items-center gap-1 border-b border-slate-200 pb-1.5 mb-1.5 text-[#576B95] font-semibold">
              <ThumbsUp className="h-3 w-3" />
              {locale === "zh" ? "小林、Mike、Alex、Jenny" : "Sarah, Mike, Alex, Jenny"}
            </div>
            <div>
              <p className="text-slate-800"><span className="font-semibold text-[#576B95]">Tom:</span> {locale === "zh" ? "这个内容包很完整，已经转发给团队了。" : "This content kit is incredibly well-crafted — already shared it!"}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
