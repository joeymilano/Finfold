import type { Metadata } from "next";
import Link from "next/link";
import { FishLogo } from "@/components/app-shell/FishLogo";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { brand } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Support — Finfold",
  description:
    "Get help with Finfold accounts, content kits, billing, privacy, and the Finfold plugin for ChatGPT and Codex.",
  alternates: { canonical: "/support" }
};

const supportEmail = brand.legal.contactEmail;
const supportHref = `mailto:${supportEmail}?subject=${encodeURIComponent("Finfold support request")}`;

export default function SupportPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-hairline bg-surface/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-4">
          <Link href="/" className="focus-ring flex items-center gap-2 rounded-md">
            <FishLogo variant="app-icon" className="h-6 w-6 rounded-[22%] object-cover" />
            <span className="text-sm font-bold text-fg">Finfold</span>
          </Link>
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-fg-muted">
            Support
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-12 sm:py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">
          Finfold support
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-fg sm:text-4xl">
          Tell us what stopped you.
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-fg-muted sm:text-base">
          We help with accounts, saved content kits, billing, privacy requests, and the
          Finfold plugin for ChatGPT and Codex. We normally respond within two business days.
        </p>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg-muted">
          我们可以协助处理账户、内容包、账单、隐私请求，以及 Finfold 在 ChatGPT 和 Codex
          中的连接问题，通常会在两个工作日内回复。
        </p>

        <a
          href={supportHref}
          className="focus-ring mt-8 inline-flex min-h-11 items-center justify-center rounded-xl bg-brand px-5 text-sm font-bold text-on-brand transition hover:brightness-105"
        >
          Email {supportEmail}
        </a>

        <div className="mt-12 grid gap-5 sm:grid-cols-2">
          <section className="rounded-2xl border border-hairline bg-surface-raised p-5">
            <h2 className="text-base font-bold text-fg">Include in your message</h2>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-fg-muted">
              <li>• The action you were trying to complete.</li>
              <li>• The approximate time and the error message shown.</li>
              <li>• Your browser or ChatGPT/Codex surface.</li>
            </ul>
          </section>
          <section className="rounded-2xl border border-hairline bg-surface-raised p-5">
            <h2 className="text-base font-bold text-fg">Keep secrets private</h2>
            <p className="mt-3 text-sm leading-relaxed text-fg-muted">
              Never email passwords, API keys, OAuth tokens, recovery codes, or private customer
              content. We will never ask for them.
            </p>
          </section>
        </div>

        <section className="mt-10 border-t border-hairline pt-8">
          <h2 className="text-base font-bold text-fg">Connected-assistant help</h2>
          <p className="mt-3 text-sm leading-relaxed text-fg-muted">
            If a Finfold connection stops working, revoke the connection in Finfold Settings and
            reconnect it from ChatGPT or Codex. Creating a content kit saves a private draft; it
            never publishes to a social account.
          </p>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
            <Link href="/privacy" className="focus-ring rounded text-brand hover:underline">
              Privacy Policy
            </Link>
            <Link href="/terms" className="focus-ring rounded text-brand hover:underline">
              Terms of Service
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
