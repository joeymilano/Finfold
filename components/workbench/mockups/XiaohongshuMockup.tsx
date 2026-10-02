import { Heart, MessageCircle, Share2, Star } from "@/components/ui/icons";
import type { Locale } from "@/lib/i18n";

export function XiaohongshuMockup({ title, body, cta, notes, imageUrl, locale }: { title: string; body: string; cta: string; notes: string; imageUrl?: string; locale: Locale }) {
  return (
    <div className="flex flex-col bg-white">
      {/* Xiaohongshu simulated navigation */}
      <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2.5 text-xs text-slate-800 font-semibold">
        <span className="text-slate-400">{locale === "zh" ? "返回" : "Back"}</span>
        <span className="text-slate-900 font-bold">{locale === "zh" ? "笔记详情" : "Note Detail"}</span>
        <Share2 className="h-4 w-4 text-slate-700" />
      </div>

      {/* Cover image */}
      {imageUrl ? (
        <div className="relative aspect-[4/3] overflow-hidden">
          <img src={imageUrl} alt={title} className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
          <div className="absolute bottom-3 left-3 right-3 z-10">
            <span className="inline-flex rounded-full bg-rose-500 px-3 py-1 text-[10px] font-bold tracking-wider uppercase mb-1 shadow-sm">
              小红书 封面
            </span>
            <h4 dir="auto" className="line-clamp-2 text-start text-sm font-bold leading-snug text-white">{title}</h4>
          </div>
        </div>
      ) : (
      <div className="relative aspect-[4/3] bg-gradient-to-tr from-rose-400/80 via-rose-500 to-indigo-600/90 flex flex-col items-center justify-center p-6 text-center text-white">
        <div className="absolute inset-0 bg-slate-950/20 backdrop-blur-[1px]" />
        <div className="relative z-10">
          <span className="inline-flex rounded-full bg-rose-500 px-3 py-1 text-[10px] font-bold tracking-wider uppercase mb-2 shadow-sm">
            小红书 封面
          </span>
          <h4 dir="auto" className="line-clamp-3 px-3 text-start text-lg font-bold leading-snug">{title}</h4>
        </div>
      </div>
      )}

      {/* Publisher row */}
      <div className="flex items-center justify-between px-3.5 py-3 border-b border-slate-50">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-rose-500 border border-slate-100 flex items-center justify-center text-white text-xs font-bold font-serif">
            红
          </div>
          <div>
            <p className="text-xs font-bold text-slate-950">{locale === "zh" ? "增长笔记" : "Growth_Hacker"}</p>
            <p className="text-[10px] text-slate-400">{locale === "zh" ? "上海 · 刚刚" : "Shanghai · Just now"}</p>
          </div>
        </div>
        <button type="button" className="rounded-full bg-rose-500 px-3.5 py-1 text-xs font-semibold text-white shadow-sm hover:bg-rose-600 transition-colors">
          {locale === "zh" ? "关注" : "Follow"}
        </button>
      </div>

      {/* Content detail */}
      <div className="p-3.5 max-h-72 overflow-y-auto leading-relaxed">
        <h1 dir="auto" className="mb-2 text-start text-sm font-bold text-slate-950">{title}</h1>
        <p dir="auto" className="whitespace-pre-wrap text-start text-xs text-slate-800">{body}</p>
        {cta && <p dir="auto" className="mt-3 text-start text-xs font-semibold text-rose-600">{cta}</p>}
        {notes && <p className="mt-3 text-[11px] text-slate-400 bg-slate-50 rounded p-2 border border-slate-100">{notes}</p>}
        <div className="mt-3.5 flex flex-wrap gap-1.5">
          <span className="text-xs font-medium text-blue-500 hover:underline">#独立开发者</span>
          <span className="text-xs font-medium text-blue-500 hover:underline">#内容增长</span>
        </div>
      </div>

      {/* Xiaohongshu Bottom Interaction Bar */}
      <div className="flex items-center justify-between border-t border-slate-100 px-3.5 py-3 bg-white text-slate-500">
        <div className="flex items-center gap-4 text-xs font-medium">
          <span className="flex items-center gap-1 hover:text-rose-500 cursor-pointer">
            <Heart className="h-4.5 w-4.5" />
            99+
          </span>
          <span className="flex items-center gap-1 hover:text-yellow-500 cursor-pointer">
            <Star className="h-4.5 w-4.5" />
            {locale === "zh" ? "收藏" : "Save"}
          </span>
          <span className="flex items-center gap-1 hover:text-blue-500 cursor-pointer">
            <MessageCircle className="h-4.5 w-4.5" />
            {locale === "zh" ? "评论" : "Comment"}
          </span>
        </div>
        <button type="button" className="rounded-full bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 text-xs font-bold transition-all">
          {locale === "zh" ? "私信" : "Message"}
        </button>
      </div>
    </div>
  );
}
