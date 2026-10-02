"use client";

import Link from "next/link";
import Script from "next/script";
import { FormEvent, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Lock,
  Mail,
  MessageSquare,
  ShieldCheck
} from "@/components/ui/icons";

type TurnstileRenderOptions = {
  sitekey: string;
  action: string;
  theme: "light" | "dark" | "auto";
  size: "normal" | "compact" | "flexible";
  appearance: "always" | "execute" | "interaction-only";
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": () => void;
};

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

type Copy = {
  label: string;
  heading: string;
  intro: string;
  pointOne: string;
  pointTwo: string;
  pointThree: string;
  formEyebrow: string;
  formTitle: string;
  company: string;
  companyPlaceholder: string;
  email: string;
  emailPlaceholder: string;
  need: string;
  needPlaceholder: string;
  consentPrefix: string;
  privacy: string;
  consentSuffix: string;
  verify: string;
  submit: string;
  sending: string;
  successEyebrow: string;
  successTitle: string;
  successBody: string;
  closedTitle: string;
  closedBody: string;
  unavailable: string;
  footer: string;
};

const COPY: Record<"en" | "zh", Copy> = {
  en: {
    label: "A direct line, with context",
    heading: "Start with the problem worth solving.",
    intro: "Tell the team what you are trying to change. Your note arrives with its source intact, ready for a real person to review.",
    pointOne: "No scraped contact details",
    pointTwo: "No automatic outreach",
    pointThree: "You decide what to share",
    formEyebrow: "PRIVATE INQUIRY",
    formTitle: "Talk to",
    company: "Company or brand",
    companyPlaceholder: "Acme Studio",
    email: "Work email",
    emailPlaceholder: "you@company.com",
    need: "What are you trying to achieve?",
    needPlaceholder: "Give enough context for a useful first reply — the goal, current obstacle, and what a good outcome looks like.",
    consentPrefix: "I agree that my information may be used to respond to this inquiry, as described in the",
    privacy: "Privacy Policy",
    consentSuffix: ".",
    verify: "Complete verification to send",
    submit: "Send a useful brief",
    sending: "Sending securely…",
    successEyebrow: "RECEIVED",
    successTitle: "Your context made it through.",
    successBody: "The team can now review the problem in your own words. Nothing has been marked as a qualified lead until they verify the fit.",
    closedTitle: "This conversation is paused.",
    closedBody: "The team is no longer accepting inquiries through this link.",
    unavailable: "Secure verification is temporarily unavailable. Please return shortly.",
    footer: "Protected by Turnstile. Contact details are encrypted before storage."
  },
  zh: {
    label: "带着上下文，直接沟通",
    heading: "先说清楚真正值得解决的问题。",
    intro: "告诉团队你想改变什么。你的需求会保留来源，由真人判断是否适合继续沟通。",
    pointOne: "不抓取联系方式",
    pointTwo: "不自动发送营销消息",
    pointThree: "你决定分享什么",
    formEyebrow: "私密咨询",
    formTitle: "联系",
    company: "公司或品牌",
    companyPlaceholder: "例如：一间产品工作室",
    email: "工作邮箱",
    emailPlaceholder: "you@company.com",
    need: "你希望解决什么问题？",
    needPlaceholder: "请简单说明目标、当前卡点，以及什么样的结果对你有价值。",
    consentPrefix: "我同意团队依据",
    privacy: "隐私政策",
    consentSuffix: "使用这些信息回复本次咨询。",
    verify: "完成安全验证后即可发送",
    submit: "发送清晰需求",
    sending: "正在安全发送…",
    successEyebrow: "已收到",
    successTitle: "你的真实需求已经送达。",
    successBody: "团队现在可以按你的原话判断是否适合继续沟通；在人工确认之前，系统不会把它算作有效线索。",
    closedTitle: "本次咨询已暂停。",
    closedBody: "团队目前不再通过这个链接接收新的需求。",
    unavailable: "安全验证暂时不可用，请稍后再来。",
    footer: "由 Turnstile 提供安全验证；联系方式会在入库前加密。"
  }
};

export function PublicLeadForm({
  code,
  displayName,
  destinationHost,
  acceptingSubmissions,
  locale,
  siteKey
}: {
  code: string;
  displayName: string;
  destinationHost: string;
  acceptingSubmissions: boolean;
  locale: "en" | "zh";
  siteKey: string;
}) {
  const copy = COPY[locale];
  const widgetContainerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const submissionIdRef = useRef<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [company, setCompany] = useState("");
  const [workEmail, setWorkEmail] = useState("");
  const [need, setNeed] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (window.turnstile) setScriptReady(true);
  }, []);

  useEffect(() => {
    if (!scriptReady || !siteKey || !widgetContainerRef.current || !window.turnstile || widgetIdRef.current) return;
    widgetIdRef.current = window.turnstile.render(widgetContainerRef.current, {
      sitekey: siteKey,
      action: "native_lead",
      theme: "light",
      size: "flexible",
      appearance: "interaction-only",
      callback: setTurnstileToken,
      "expired-callback": () => setTurnstileToken(""),
      "error-callback": () => setTurnstileToken("")
    });
    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [scriptReady, siteKey]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!turnstileToken || !consent || submitting) return;
    setSubmitting(true);
    setError(null);
    submissionIdRef.current ??= crypto.randomUUID();
    try {
      const response = await fetch(`/api/leads/${encodeURIComponent(code)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId: submissionIdRef.current,
          workEmail,
          company,
          need,
          consent,
          locale,
          turnstileToken
        })
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? copy.unavailable);
      setSubmitted(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.unavailable);
      setTurnstileToken("");
      if (widgetIdRef.current && window.turnstile) window.turnstile.reset(widgetIdRef.current);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0d0c09] text-[#f3eee3]">
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(240,200,120,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(240,200,120,0.055)_1px,transparent_1px)] [background-size:52px_52px]" />
      <div aria-hidden className="pointer-events-none absolute -left-32 top-24 h-[420px] w-[420px] rounded-full bg-[#c6924b]/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute right-[-120px] top-[-80px] h-[360px] w-[360px] rotate-12 border border-[#d8a95e]/15" />

      <div className="relative mx-auto flex min-h-screen max-w-[1180px] flex-col px-5 py-6 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between border-b border-white/10 pb-5">
          <Link href="/" className="focus-ring rounded text-sm font-black tracking-[-0.02em] text-[#f5efe3]">
            FINFOLD<span className="text-[#d8a95e]">/</span>
          </Link>
          <span className="max-w-[55vw] truncate font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">
            {destinationHost}
          </span>
        </header>

        <div className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[minmax(0,0.88fr)_minmax(420px,0.72fr)] lg:gap-20 lg:py-16">
          <section className="max-w-xl">
            <div className="inline-flex items-center gap-2 border-l-2 border-[#d8a95e] pl-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#d8a95e]">
              <ShieldCheck className="h-4 w-4" />{copy.label}
            </div>
            <h1 className="mt-8 font-[family-name:var(--font-fraunces)] text-5xl font-semibold leading-[0.98] tracking-[-0.045em] text-[#f7f1e6] sm:text-6xl lg:text-7xl">
              {copy.heading}
            </h1>
            <p className="mt-7 max-w-lg text-sm font-medium leading-7 text-white/52 sm:text-base">
              {copy.intro}
            </p>
            <div className="mt-9 grid gap-3 border-t border-white/10 pt-6 sm:grid-cols-3">
              {[copy.pointOne, copy.pointTwo, copy.pointThree].map((point, index) => (
                <div key={point} className="flex items-start gap-2 text-xs font-semibold leading-5 text-white/48">
                  <span className="mt-0.5 font-mono text-[10px] text-[#d8a95e]">0{index + 1}</span>
                  <span>{point}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="relative">
            <div aria-hidden className="absolute -inset-3 translate-x-3 translate-y-3 border border-[#d8a95e]/30" />
            <div className="relative bg-[#f4f0e5] px-5 py-6 text-[#17140f] shadow-[0_34px_90px_-30px_rgba(0,0,0,0.78)] sm:px-8 sm:py-8">
              {!acceptingSubmissions ? (
                <StateMessage title={copy.closedTitle} body={copy.closedBody} />
              ) : submitted ? (
                <StateMessage title={copy.successTitle} body={copy.successBody} eyebrow={copy.successEyebrow} success />
              ) : (
                <>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#80613a]">{copy.formEyebrow}</p>
                  <h2 className="mt-3 font-[family-name:var(--font-fraunces)] text-3xl font-semibold leading-tight tracking-[-0.025em] sm:text-4xl">
                    {copy.formTitle} <span className="italic text-[#8b5e2d]">{displayName}</span>
                  </h2>
                  <form onSubmit={submit} className="mt-7 grid gap-5">
                    <LeadField icon={<Building2 className="h-4 w-4" />} label={copy.company}>
                      <input
                        required
                        minLength={2}
                        maxLength={120}
                        autoComplete="organization"
                        value={company}
                        onChange={(event) => setCompany(event.target.value)}
                        placeholder={copy.companyPlaceholder}
                        className="mt-2 w-full border-0 border-b border-[#c9c0ae] bg-transparent px-0 py-2.5 text-sm font-semibold text-[#17140f] outline-none transition placeholder:text-[#837b6d]/60 focus:border-[#8b5e2d]"
                      />
                    </LeadField>
                    <LeadField icon={<Mail className="h-4 w-4" />} label={copy.email}>
                      <input
                        required
                        type="email"
                        maxLength={254}
                        autoComplete="email"
                        value={workEmail}
                        onChange={(event) => setWorkEmail(event.target.value)}
                        placeholder={copy.emailPlaceholder}
                        className="mt-2 w-full border-0 border-b border-[#c9c0ae] bg-transparent px-0 py-2.5 text-sm font-semibold text-[#17140f] outline-none transition placeholder:text-[#837b6d]/60 focus:border-[#8b5e2d]"
                      />
                    </LeadField>
                    <LeadField icon={<MessageSquare className="h-4 w-4" />} label={copy.need}>
                      <textarea
                        required
                        aria-label={copy.need}
                        minLength={10}
                        maxLength={2000}
                        rows={5}
                        value={need}
                        onChange={(event) => setNeed(event.target.value)}
                        placeholder={copy.needPlaceholder}
                        className="mt-3 w-full resize-y border border-[#c9c0ae] bg-[#fffdf7] px-3 py-3 text-sm font-medium leading-6 text-[#17140f] outline-none transition placeholder:text-[#837b6d]/60 focus:border-[#8b5e2d] focus:ring-2 focus:ring-[#8b5e2d]/10"
                      />
                      <span className="mt-1 block text-right font-mono text-[9px] text-[#837b6d]">{need.length}/2000</span>
                    </LeadField>
                    <label className="flex cursor-pointer items-start gap-3 text-[11px] font-medium leading-5 text-[#5f584c]">
                      <input
                        required
                        type="checkbox"
                        checked={consent}
                        onChange={(event) => setConsent(event.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[#8b5e2d]"
                      />
                      <span>
                        {copy.consentPrefix} <Link href="/privacy" target="_blank" className="font-bold text-[#704a26] underline decoration-[#b89a77] underline-offset-2">{copy.privacy}</Link>{copy.consentSuffix}
                      </span>
                    </label>
                    <div ref={widgetContainerRef} className="min-h-1 w-full" />
                    {!siteKey ? <p className="text-xs font-bold text-[#9d2f2f]">{copy.unavailable}</p> : null}
                    {error ? <p role="alert" className="border-l-2 border-[#9d2f2f] pl-3 text-xs font-bold leading-5 text-[#9d2f2f]">{error}</p> : null}
                    <button
                      type="submit"
                      disabled={!siteKey || !turnstileToken || !consent || submitting}
                      className="focus-ring group flex min-h-12 w-full items-center justify-between bg-[#17140f] px-4 py-3 text-sm font-bold text-[#f8f1e4] transition hover:bg-[#2a241b] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <span>{submitting ? copy.sending : turnstileToken ? copy.submit : copy.verify}</span>
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </button>
                  </form>
                </>
              )}
              <div className="mt-6 flex items-start gap-2 border-t border-[#d6cebe] pt-4 text-[10px] font-medium leading-4 text-[#746c60]">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{copy.footer}</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function LeadField({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="flex items-center gap-2 text-xs font-bold text-[#4f483e]">{icon}{label}</span>
      {children}
    </label>
  );
}

function StateMessage({ title, body, eyebrow, success }: { title: string; body: string; eyebrow?: string; success?: boolean }) {
  return (
    <div className="flex min-h-[420px] flex-col justify-center">
      <span className={`flex h-12 w-12 items-center justify-center border ${success ? "border-[#3d8267] bg-[#3d8267]/10 text-[#2e6a53]" : "border-[#9b805d] bg-[#9b805d]/10 text-[#765b39]"}`}>
        {success ? <CheckCircle2 className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
      </span>
      {eyebrow ? <p className="mt-6 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#80613a]">{eyebrow}</p> : null}
      <h2 className="mt-3 font-[family-name:var(--font-fraunces)] text-4xl font-semibold leading-tight tracking-[-0.035em]">{title}</h2>
      <p className="mt-4 max-w-sm text-sm font-medium leading-7 text-[#6c6457]">{body}</p>
    </div>
  );
}
