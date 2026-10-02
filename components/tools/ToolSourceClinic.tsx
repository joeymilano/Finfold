"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, CircleDotDashed } from "@/components/ui/icons";
import type { Locale } from "@/lib/i18n";
import type { ToolPageConfig } from "@/lib/tool-pages";
import { captureEvent } from "@/lib/posthog";

type SourceCheck = {
  id: string;
  labelZh: string;
  labelEn: string;
  helpZh: string;
  helpEn: string;
  pass: boolean;
};

const sampleZh = "7 月 22 日，我们修了一个很尴尬的问题。用户已经生成了内容，点保存却永远失败。排查后发现，旧表里少了 updated_at 这一列。我们补上迁移 042，又把数据库迁移检查放进发版流程。以后缺表或缺列，代码上线前就会被拦住。想看看大家还遇到过哪些发布前测不出来的问题。";
const sampleEn = "On July 22, we fixed an embarrassing bug. A user could generate content, but every save failed. The old table was missing an updated_at column. We added migration 042 and put a database migration check into the release gate, so missing tables or columns are caught before deployment. I would like to hear which production-only failures other teams have run into.";

function analyzeSource(value: string): SourceCheck[] {
  const source = value.trim();
  return [
    {
      id: "person",
      labelZh: "人物或团队",
      labelEn: "Person or team",
      helpZh: "写清谁做了什么。",
      helpEn: "Name who did what.",
      pass: /(我|我们|团队|创始人|客户|用户|店主|作者|工程师|设计师|I\b|we\b|our team|founder|customer|user)/i.test(source)
    },
    {
      id: "moment",
      labelZh: "时间或场景",
      labelEn: "Time or situation",
      helpZh: "补上时间或一次具体操作。",
      helpEn: "Add a time or one concrete action.",
      pass: /(今天|昨天|上周|上个月|周[一二三四五六日天]|凌晨|早上|下午|晚上|第\s*\d|\d{1,4}\s*[年月日天周]|版本|上线|发布|点击|打开|收到|when\b|today|yesterday|last\s+(week|month)|monday|tuesday|wednesday|thursday|friday|morning|afternoon|evening|launched|released|clicked|opened)/i.test(source)
    },
    {
      id: "evidence",
      labelZh: "可核对的事实",
      labelEn: "Verifiable fact",
      helpZh: "加一个数字、版本、截图或结果。",
      helpEn: "Add a number, version, screenshot, or result.",
      pass: /(\d|¥|￥|\$|%|版本|迁移|截图|反馈|订单|访问|注册|收入|成本|小时|分钟|天|周|月|version|migration|screenshot|feedback|order|visit|signup|revenue|cost|hours?|minutes?|days?|weeks?|months?)/i.test(source)
    },
    {
      id: "consequence",
      labelZh: "问题和后果",
      labelEn: "Problem and consequence",
      helpZh: "说清哪里卡住，后来改了什么。",
      helpEn: "Say what failed and what changed.",
      pass: /(但|却|失败|报错|问题|卡住|删掉|重做|修复|补上|改成|少了|多花|浪费|结果|后来|finally|but|failed|error|problem|stuck|deleted|rebuilt|fixed|changed|missing|cost|result)/i.test(source)
    },
    {
      id: "next",
      labelZh: "下一步",
      labelEn: "Next step",
      helpZh: "留一个问题、邀请或业务动作。",
      helpEn: "Leave a question, invitation, or business action.",
      pass: /(想知道|想看看|欢迎|请|试试|告诉我|评论|回复|注册|预约|下载|了解|what do you|would like|tell me|comment|reply|try|sign up|book|download|learn more)/i.test(source)
    }
  ];
}

export function ToolSourceClinic({
  config,
  locale
}: {
  config: ToolPageConfig;
  locale: Locale;
}) {
  const isEn = locale === "en";
  const [source, setSource] = useState("");
  const checks = useMemo(() => analyzeSource(source), [source]);
  const score = checks.filter((check) => check.pass).length;
  const sourceReady = source.trim().length >= 20;
  const missingCount = checks.length - score;
  const status = !sourceReady
    ? (isEn ? "Waiting for input" : "等待输入")
    : missingCount === 0
      ? (isEn ? "Ready to continue" : "可以继续生成")
      : (isEn ? `${missingCount} things to add` : `还可以补 ${missingCount} 项`);
  const workbenchHref = sourceReady
    ? `/workbench?platform=${encodeURIComponent(config.platform)}&idea=${encodeURIComponent(source.trim())}`
    : `/workbench?platform=${encodeURIComponent(config.platform)}`;

  function loadSample() {
    setSource(isEn ? sampleEn : sampleZh);
    captureEvent("tool_source_sample_loaded", { tool: config.slug, locale });
  }

  return (
    <section className="mx-auto max-w-6xl px-5 pb-12" aria-labelledby="source-clinic-heading">
      <div className="overflow-hidden rounded-[1.5rem] border border-hairline bg-surface shadow-raised">
        <div className="grid lg:grid-cols-[1.15fr_0.85fr]">
          <div className="p-6 sm:p-8 lg:p-10">
            <div className="flex items-center justify-between gap-4">
              <p className="eyebrow-mono text-brand">{isEn ? "TRY IT FREE" : "免费试用"}</p>
              <button
                type="button"
                onClick={loadSample}
                className="focus-ring text-xs font-semibold text-fg-muted underline decoration-hairline-strong underline-offset-4 transition-colors hover:text-brand"
              >
                {isEn ? "Use example" : "看示例"}
              </button>
            </div>

            <h2 id="source-clinic-heading" className={`mt-4 text-3xl leading-tight text-fg sm:text-4xl ${isEn ? "font-display" : "font-display-zh"}`}>
              {isEn ? "Paste your source." : "粘贴原材料。"}
            </h2>
            <p className="mt-3 text-sm leading-6 text-fg-muted">
              {isEn ? "Check it first. Sign in when you are ready to generate." : "先检查这段材料够不够写，开始生成时再登录。"}
            </p>

            <label htmlFor={`tool-source-${config.slug}`} className="sr-only">
              {isEn ? "Your source" : "你的原材料"}
            </label>
            <textarea
              id={`tool-source-${config.slug}`}
              value={source}
              onChange={(event) => setSource(event.target.value)}
              maxLength={1600}
              rows={7}
              placeholder={isEn ? "Paste a product update, customer note, interview, or rough idea." : "贴上产品更新、客户反馈、采访片段或还没写完的想法。"}
              className="focus-ring mt-6 w-full resize-y rounded-2xl border border-hairline bg-bg/55 px-4 py-4 text-[15px] leading-7 text-fg placeholder:text-fg-muted/60"
            />
            <div className="mt-2 flex items-center justify-between gap-4 text-xs text-fg-muted">
              <span>{isEn ? "Checked in this browser. Nothing is uploaded." : "检查在浏览器完成，不上传内容。"}</span>
              <span className="tabular">{source.length} / 1600</span>
            </div>
          </div>

          <div className="border-t border-hairline bg-surface-2/50 p-6 sm:p-8 lg:border-l lg:border-t-0 lg:p-10">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="eyebrow-mono text-brand">{isEn ? "CHECK" : "检查结果"}</p>
                <p className={`mt-3 text-2xl text-fg ${isEn ? "font-display" : "font-display-zh"}`}>{status}</p>
              </div>
              <span className="text-sm tabular text-fg-muted">{sourceReady ? `${score} / ${checks.length}` : "0 / 5"}</span>
            </div>

            <ul className="mt-6 border-y border-hairline">
              {checks.map((check) => (
                <li key={check.id} className="flex gap-3 border-b border-hairline py-3.5 last:border-b-0">
                  {check.pass ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-positive" />
                  ) : (
                    <CircleDotDashed className="mt-0.5 h-4 w-4 shrink-0 text-fg-muted/60" />
                  )}
                  <div>
                    <p className="text-sm font-semibold text-fg">{isEn ? check.labelEn : check.labelZh}</p>
                    {!check.pass && sourceReady ? (
                      <p className="mt-1 text-xs leading-5 text-fg-muted">{isEn ? check.helpEn : check.helpZh}</p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>

            {sourceReady ? (
              <Link
                href={workbenchHref}
                onClick={() => captureEvent("tool_source_handoff_clicked", { tool: config.slug, locale, sourceCheckScore: score })}
                className="btn-primary focus-ring mt-6 flex w-full items-center justify-center gap-2 text-sm"
              >
                {isEn ? "Continue to generate" : "继续生成"}
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <div className="mt-6 flex w-full items-center justify-center rounded-xl border border-hairline bg-surface px-4 py-3 text-sm font-semibold text-fg-muted">
                {isEn ? "Enter at least 20 characters" : "输入至少 20 个字"}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
