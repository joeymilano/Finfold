"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, RotateCcw, Share2 } from "@/components/ui/icons";
import { brand } from "@/lib/brand";
import { resolveLeadToolResult, type LeadToolAnswers, type LeadToolSpec } from "@/lib/lead-tools/schema";

/**
 * Deterministic visitor runtime for /t/[slug] and the owner's draft
 * preview. All quiz logic — option points, band lookup — runs in the
 * browser from the published spec; no model call, no backend round-trip
 * per visit. In public mode the only network calls are two aggregate
 * counter beacons (completion, entry click).
 */
export function LeadToolRuntime({
  spec,
  slug,
  mode
}: {
  spec: LeadToolSpec;
  slug?: string;
  mode: "public" | "preview";
}) {
  const [phase, setPhase] = useState<"intro" | "quiz" | "result">("intro");
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<LeadToolAnswers>({});
  const [copied, setCopied] = useState(false);
  const completedOnce = useRef(false);
  const clickedEntries = useRef(new Set<string>());

  const accent = spec.brand.accent_color;
  const result = useMemo(
    () => (phase === "result" ? resolveLeadToolResult(spec, answers) : null),
    [phase, spec, answers]
  );

  function choose(questionId: string, optionId: string) {
    const next = { ...answers, [questionId]: optionId };
    setAnswers(next);
    if (step + 1 < spec.questions.length) {
      setStep(step + 1);
    } else {
      setPhase("result");
    }
  }

  function reportEvent(event: "complete" | "cta_click", payload?: { resultId?: string; entryId?: string }) {
    if (mode !== "public" || !slug) return;
    void fetch(`/api/public/lead-tools/${slug}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ event, ...payload })
    }).catch(() => undefined);
  }

  if (phase === "result" && result && !completedOnce.current) {
    completedOnce.current = true;
    reportEvent("complete", { resultId: result.id });
  }

  const entry = result ? spec.entries.find((candidate) => candidate.id === result.entry) : undefined;
  const progress = phase === "result" ? spec.questions.length : Object.keys(answers).length;

  async function share() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const shareData = { title: spec.title, text: spec.brand.name, url };
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // user dismissed — fall through to copy
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable on some in-app browsers
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-14 pt-8 sm:pt-12">
      {/* Owner brand is the hero; Finfold stays a closable footer credit. */}
      <header className="mb-6 flex items-center gap-3">
        {spec.brand.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={spec.brand.logo_url} alt={spec.brand.name} className="h-11 w-11 rounded-xl object-cover" />
        ) : (
          <span
            className="flex h-11 w-11 items-center justify-center rounded-xl text-lg font-bold text-white"
            style={{ backgroundColor: accent }}
          >
            {spec.brand.name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="min-w-0">
          <span className="block truncate text-base font-semibold text-fg">{spec.brand.name}</span>
          {spec.brand.tagline ? <span className="block truncate text-xs text-fg-muted">{spec.brand.tagline}</span> : null}
        </span>
      </header>

      {phase === "intro" ? (
        <section className="panel p-6">
          <h1 className="text-xl font-semibold leading-snug text-fg sm:text-2xl">{spec.title}</h1>
          <p className="mt-3 text-sm leading-6 text-fg-muted">{spec.intro}</p>
          <p className="mt-4 text-xs text-fg-muted">
            {spec.questions.length} 道题 · 约 2 分钟 · 匿名作答，不记录个人答案
          </p>
          <button
            type="button"
            onClick={() => setPhase("quiz")}
            className="focus-ring mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90"
            style={{ backgroundColor: accent }}
          >
            开始 <ArrowRight className="h-4 w-4" />
          </button>
        </section>
      ) : null}

      {phase === "quiz" ? (
        <section className="panel p-6">
          <div className="mb-5 flex items-center gap-1.5" aria-label={`第 ${step + 1} / ${spec.questions.length} 题`}>
            {spec.questions.map((question, index) => (
              <span
                key={question.id}
                className="h-1.5 flex-1 rounded-full"
                style={{ backgroundColor: index <= step ? accent : "var(--hairline, #e5e7eb)" }}
              />
            ))}
          </div>

          {(() => {
            const question = spec.questions[step];
            return (
              <>
                <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">第 {step + 1} 题</p>
                <h2 className="mt-2 text-lg font-semibold leading-snug text-fg">{question.text}</h2>
                {question.help ? <p className="mt-1.5 text-xs text-fg-muted">{question.help}</p> : null}

                <div className="mt-5 flex flex-col gap-2.5">
                  {question.options.map((option) => {
                    const selected = answers[question.id] === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => choose(question.id, option.id)}
                        className="focus-ring rounded-xl border px-4 py-3 text-left text-sm leading-5 text-fg transition hover:bg-surface-2"
                        style={
                          selected
                            ? { borderColor: accent, backgroundColor: `${accent}14`, boxShadow: `0 0 0 1px ${accent}` }
                            : { borderColor: "var(--hairline, #e5e7eb)" }
                        }
                      >
                        {option.text}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-6 flex items-center justify-between">
                  {step > 0 ? (
                    <button
                      type="button"
                      onClick={() => setStep(step - 1)}
                      className="focus-ring inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-fg-muted hover:text-fg"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" /> 上一题
                    </button>
                  ) : (
                    <span />
                  )}
                  <span className="text-xs text-fg-muted">
                    {progress}/{spec.questions.length}
                  </span>
                </div>
              </>
            );
          })()}
        </section>
      ) : null}

      {phase === "result" ? (
        <section className="panel p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{spec.brand.name} · 你的结果</p>
          {result ? (
            <>
              <h2 className="mt-2 text-xl font-semibold leading-snug text-fg">{result.title}</h2>
              <p className="mt-3 text-sm leading-6 text-fg">{result.summary}</p>

              <div className="mt-5">
                <p className="text-sm font-semibold text-fg">现在可以先做这三件事</p>
                <ul className="mt-3 flex flex-col gap-2">
                  {result.checklist.map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-sm leading-6 text-fg">
                      <Check className="mt-1 h-4 w-4 shrink-0" style={{ color: accent }} />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="panel-inset mt-5 p-4">
                <p className="text-xs font-semibold text-fg-muted">为什么给你这个结果</p>
                <p className="mt-1.5 text-xs leading-5 text-fg-muted">{result.basis}</p>
              </div>

              {entry ? (
                entry.url ? (
                  <a
                    href={entry.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => {
                      if (!clickedEntries.current.has(entry.id)) {
                        clickedEntries.current.add(entry.id);
                        reportEvent("cta_click", { entryId: entry.id });
                      }
                    }}
                    className="focus-ring mt-6 flex w-full flex-col items-center gap-1 rounded-xl px-4 py-3.5 text-sm font-semibold text-white transition hover:opacity-90"
                    style={{ backgroundColor: accent }}
                  >
                    {entry.label}
                    {entry.hint ? <span className="text-[11px] font-normal opacity-80">{entry.hint}</span> : null}
                  </a>
                ) : mode === "preview" ? (
                  <p className="mt-6 rounded-xl border border-dashed px-4 py-3 text-center text-xs text-fg-muted">
                    入口「{entry.label}」还没有填链接，发布前需要补上
                  </p>
                ) : null
              ) : null}

              <div className="mt-4 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={share}
                  className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-hairline px-3 py-2 text-xs text-fg-muted hover:text-fg"
                >
                  <Share2 className="h-3.5 w-3.5" /> {copied ? "链接已复制" : "分享给朋友"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAnswers({});
                    setStep(0);
                    setPhase("quiz");
                  }}
                  className="focus-ring inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-fg-muted hover:text-fg"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> 重新测
                </button>
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-fg-muted">
              结果计算出现问题，请重新测一遍。若仍然如此，请联系工具作者。
            </p>
          )}
        </section>
      ) : null}

      <footer className="mt-8 space-y-2 text-center">
        <p className="text-[11px] leading-4 text-fg-muted">
          本页统计为匿名汇总，不记录个人答案，也不需要注册任何账号。
        </p>
        {mode === "public" && spec.brand.show_finfold_credit ? (
          <a
            href="/workbuddy?utm_source=leadtool_footer&utm_medium=tool_footer"
            className="inline-block text-[11px] text-fg-muted underline-offset-2 hover:underline"
          >
            由 {brand.name} 制作 · 为我的业务做一个
          </a>
        ) : null}
      </footer>
    </div>
  );
}
