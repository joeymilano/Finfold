"use client";

import Link from "next/link";
import { ArrowRight, Download, FileStack, Send } from "lucide-react";
import { packages, packageStatusLabels } from "@/lib/ops-data";
import { useLocale } from "@/hooks/useLocale";

const statusToneClass: Record<string, string> = {
  待审核: "tag tag-warn",
  已批准: "tag tag-success",
  排期中: "tag tag-accent",
  需补齐: "tag tag-risk"
};

export default function PackagesPage() {
  const locale = useLocale();

  return (
    <div className="grid gap-6 pb-10">
      <section className="panel p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold text-fg-muted">Growth packages</p>
            <h1 className="mt-2 text-3xl font-semibold text-fg">
              {locale === "en" ? "Saved Kits" : "内容库"}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-fg-muted">
              {locale === "en"
                ? "Review saved content kits, export drafts, and track what has already been prepared. Create new content from the Workbench."
                : "查看已经保存的内容包、导出草稿、跟踪准备状态。要生成新内容，请去创作台。"}
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/workbench" className="btn-primary">
              {locale === "en" ? "Create New" : "去创作"} <FileStack className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="panel overflow-hidden">
        <div className="grid grid-cols-[1fr_160px_180px_180px] gap-4 border-b border-hairline bg-surface-2 px-5 py-3 text-xs font-semibold uppercase text-fg-muted max-lg:hidden">
          <span>{locale === "en" ? "Package" : "资产包"}</span>
          <span>{locale === "en" ? "Status" : "状态"}</span>
          <span>{locale === "en" ? "Owner" : "负责人"}</span>
          <span>{locale === "en" ? "Actions" : "动作"}</span>
        </div>
        {packages.map((item) => (
          <article key={item.id} className="grid gap-4 border-b border-hairline px-5 py-4 last:border-b-0 lg:grid-cols-[1fr_160px_180px_180px] lg:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold text-fg">{item.product}</h2>
                <span className="text-xs text-fg-muted">{item.id}</span>
              </div>
              <p className="mt-2 text-sm leading-5 text-fg-muted">
                {locale === "en" ? item.impactEn : item.impact}
              </p>
              <p className="mt-2 text-xs text-fg-muted">{item.platforms.join(" / ")} · {item.updatedAt}</p>
            </div>
            <span className={`w-fit ${statusToneClass[item.status]}`}>
              {packageStatusLabels[item.status][locale]}
            </span>
            <span className="text-sm font-medium text-fg">{item.owner}</span>
            <div className="flex gap-2">
              <button className="inline-flex items-center gap-1 rounded-md border border-hairline px-3 py-2 text-sm font-semibold text-fg">
                {locale === "en" ? "Export" : "导出"} <Download className="h-4 w-4" />
              </button>
              <button className="inline-flex items-center gap-1 rounded-md bg-fg px-3 py-2 text-sm font-semibold text-bg">
                {locale === "en" ? "Submit" : "送审"} <Send className="h-4 w-4" />
              </button>
            </div>
          </article>
        ))}
      </section>

      <Link href="/calendar" className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-fg-muted">
        {locale === "en" ? "View schedule" : "查看排期承接"} <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
