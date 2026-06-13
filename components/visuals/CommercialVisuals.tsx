import Image from "next/image";
import ChartTrend from "reicon-react/icons/ChartTrend";
import ClipboardExport from "reicon-react/icons/ClipboardExport";
import Data from "reicon-react/icons/Data";
import Radar from "reicon-react/icons/Radar";
import Routing from "reicon-react/icons/Routing";
import ShieldCheck from "reicon-react/icons/ShieldCheck";

export function ReiconBadge({
  icon,
  label,
  tone = "slate"
}: {
  icon: "radar" | "route" | "chart" | "export" | "shield" | "data";
  label: string;
  tone?: "slate" | "cyan" | "emerald";
}) {
  const Icon = {
    radar: Radar,
    route: Routing,
    chart: ChartTrend,
    export: ClipboardExport,
    shield: ShieldCheck,
    data: Data
  }[icon];

  const toneClass = {
    slate: "bg-slate-100 text-slate-800",
    cyan: "bg-cyan-100 text-cyan-800",
    emerald: "bg-emerald-100 text-emerald-800"
  }[tone];

  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${toneClass}`}>
      <Icon size={16} />
      {label}
    </span>
  );
}

export function OpsCommandIllustration({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 760 420"
      role="img"
      aria-label="Agent command center illustration"
      className={className}
    >
      <defs>
        <linearGradient id="opsPanel" x1="90" x2="670" y1="50" y2="360" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" />
          <stop offset="1" stopColor="#e0f2fe" />
        </linearGradient>
        <linearGradient id="opsAccent" x1="192" x2="590" y1="82" y2="330" gradientUnits="userSpaceOnUse">
          <stop stopColor="#22d3ee" />
          <stop offset="1" stopColor="#10b981" />
        </linearGradient>
        <filter id="opsShadow" x="60" y="18" width="650" height="372" colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="18" stdDeviation="18" floodColor="#0f172a" floodOpacity="0.14" />
        </filter>
      </defs>
      <rect width="760" height="420" rx="32" fill="#f8fafc" />
      <g filter="url(#opsShadow)">
        <rect x="92" y="54" width="576" height="312" rx="28" fill="url(#opsPanel)" stroke="#cbd5e1" />
      </g>
      <rect x="124" y="88" width="192" height="246" rx="18" fill="#0f172a" />
      <circle cx="164" cy="130" r="20" fill="#67e8f9" />
      <rect x="196" y="118" width="82" height="12" rx="6" fill="#e2e8f0" opacity="0.95" />
      <rect x="196" y="140" width="58" height="8" rx="4" fill="#94a3b8" />
      <rect x="150" y="186" width="132" height="10" rx="5" fill="#67e8f9" />
      <rect x="150" y="214" width="94" height="10" rx="5" fill="#64748b" />
      <rect x="150" y="242" width="116" height="10" rx="5" fill="#64748b" />
      <rect x="150" y="286" width="106" height="28" rx="14" fill="#cffafe" />
      <path d="M400 132c55 0 98 43 98 98s-43 98-98 98-98-43-98-98 43-98 98-98Z" fill="#ffffff" stroke="#cbd5e1" strokeWidth="2" />
      <path d="M400 166c36 0 64 28 64 64s-28 64-64 64-64-28-64-64 28-64 64-64Z" fill="#ecfeff" stroke="#67e8f9" strokeWidth="2" />
      <path d="M400 204c15 0 26 11 26 26s-11 26-26 26-26-11-26-26 11-26 26-26Z" fill="url(#opsAccent)" />
      <path d="M426 198l80-46" stroke="#10b981" strokeWidth="5" strokeLinecap="round" />
      <path d="M427 261l86 44" stroke="#22d3ee" strokeWidth="5" strokeLinecap="round" />
      <path d="M374 198l-58-38" stroke="#22d3ee" strokeWidth="5" strokeLinecap="round" />
      <path d="M374 262l-60 44" stroke="#10b981" strokeWidth="5" strokeLinecap="round" />
      <rect x="518" y="110" width="98" height="74" rx="16" fill="#ffffff" stroke="#cbd5e1" />
      <rect x="538" y="132" width="58" height="9" rx="4.5" fill="#0f172a" />
      <rect x="538" y="153" width="38" height="8" rx="4" fill="#94a3b8" />
      <rect x="526" y="270" width="108" height="74" rx="16" fill="#ffffff" stroke="#cbd5e1" />
      <rect x="548" y="292" width="55" height="9" rx="4.5" fill="#0f172a" />
      <rect x="548" y="313" width="48" height="8" rx="4" fill="#94a3b8" />
      <rect x="264" y="120" width="58" height="58" rx="16" fill="#ffffff" stroke="#cbd5e1" />
      <path d="M282 150h22m-11-11v22" stroke="#0f172a" strokeWidth="4" strokeLinecap="round" />
      <rect x="260" y="282" width="64" height="58" rx="16" fill="#ffffff" stroke="#cbd5e1" />
      <path d="M278 310l10 10 20-24" stroke="#10b981" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="400" cy="230" r="128" fill="none" stroke="#94a3b8" strokeDasharray="7 12" strokeLinecap="round" />
    </svg>
  );
}

export function PlatformAssetIllustration({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 720 360"
      role="img"
      aria-label="Cross-platform growth asset illustration"
      className={className}
    >
      <defs>
        <linearGradient id="assetBg" x1="96" x2="626" y1="30" y2="330" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f0fdfa" />
          <stop offset="1" stopColor="#eff6ff" />
        </linearGradient>
      </defs>
      <rect width="720" height="360" rx="28" fill="url(#assetBg)" />
      <rect x="72" y="62" width="170" height="236" rx="22" fill="#ffffff" stroke="#cbd5e1" />
      <rect x="104" y="96" width="80" height="12" rx="6" fill="#0f172a" />
      <rect x="104" y="128" width="106" height="9" rx="4.5" fill="#94a3b8" />
      <rect x="104" y="150" width="86" height="9" rx="4.5" fill="#94a3b8" />
      <rect x="104" y="198" width="96" height="44" rx="12" fill="#cffafe" />
      <rect x="278" y="44" width="166" height="112" rx="20" fill="#0f172a" />
      <rect x="304" y="76" width="74" height="10" rx="5" fill="#67e8f9" />
      <rect x="304" y="104" width="108" height="8" rx="4" fill="#64748b" />
      <rect x="304" y="124" width="82" height="8" rx="4" fill="#64748b" />
      <rect x="472" y="88" width="174" height="110" rx="20" fill="#ffffff" stroke="#cbd5e1" />
      <rect x="500" y="122" width="74" height="10" rx="5" fill="#0f172a" />
      <rect x="500" y="150" width="104" height="8" rx="4" fill="#94a3b8" />
      <rect x="500" y="170" width="70" height="8" rx="4" fill="#94a3b8" />
      <rect x="282" y="198" width="174" height="112" rx="20" fill="#ffffff" stroke="#cbd5e1" />
      <rect x="314" y="232" width="80" height="10" rx="5" fill="#0f172a" />
      <rect x="314" y="260" width="108" height="8" rx="4" fill="#94a3b8" />
      <rect x="314" y="280" width="72" height="8" rx="4" fill="#94a3b8" />
      <path d="M242 180h54m-18-18 18 18-18 18" stroke="#0f172a" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M444 128h46m-16-16 16 16-16 16" stroke="#0f172a" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M444 254h42m-14-14 14 14-14 14" stroke="#0f172a" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="616" cy="268" r="30" fill="#10b981" />
      <path d="M602 269l9 9 20-23" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const undrawAssets = [
  {
    title: "Content team",
    src: "/illustrations/undraw-content-team.svg",
    use: "团队内容生产与协作"
  },
  {
    title: "AI data extraction",
    src: "/illustrations/undraw-ai-data-extraction.svg",
    use: "Agent 读取运营信号"
  },
  {
    title: "Charts",
    src: "/illustrations/undraw-charts.svg",
    use: "平台表现和增长数据"
  },
  {
    title: "Setup wizard",
    src: "/illustrations/undraw-setup-wizard.svg",
    use: "自动化流程配置"
  }
];

export function UndrawAssetStrip() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {undrawAssets.map((asset) => (
        <figure key={asset.src} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex h-32 items-center justify-center rounded-md bg-slate-50 p-3">
            <Image src={asset.src} alt={` illustration`} width={260} height={180} className="max-h-full w-full object-contain" />
          </div>
          <figcaption className="mt-3">
            <p className="text-sm font-semibold text-slate-950">{asset.title}</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">{asset.use}</p>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
