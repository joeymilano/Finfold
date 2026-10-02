"use client";

import React, { type ComponentPropsWithoutRef, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { focusEvidenceCard } from "@/lib/report/evidence-nav";
import { normalizeAgentTextContent } from "@/lib/agent/text-content";

type AgentMessageContentProps = {
  content: unknown;
  compact?: boolean;
};

function ExternalLink({ href, children, ...props }: ComponentPropsWithoutRef<"a">) {
  const external = typeof href === "string" && /^https?:\/\//i.test(href);
  return (
    <a
      {...props}
      href={href}
      className="font-semibold text-action-strong underline decoration-action/35 underline-offset-4 transition hover:decoration-action dark:text-action"
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
    >
      {children}
    </a>
  );
}

function TableShell({ children }: { children?: ReactNode }) {
  return (
    <div className="my-4 max-w-full overflow-x-auto rounded-xl border border-hairline">
      <table className="w-full min-w-[34rem] border-collapse text-start text-[13px] leading-5">
        {children}
      </table>
    </div>
  );
}

/**
 * Evidence footnote markers: `[E1]` in the reply text becomes a superscript
 * badge that mirrors the EvidenceCard id, tying prose conclusions to the data
 * captured during the run.
 */
export function renderAgentEvidenceRefs(content: string): string {
  return content.replace(/\[E(\d{1,2})\]/g, (_match, id: string) => `\`E${id}\``);
}

function EvidenceRefSup({ children }: { children?: ReactNode }) {
  const text = String(children ?? "");
  if (!/^E\d{1,2}$/.test(text)) {
    return <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[0.9em] text-fg">{children}</code>;
  }
  return (
    <sup className="mx-0.5 inline-flex leading-none">
      <button
        type="button"
        data-evidence-ref={text}
        onClick={() => focusEvidenceCard(text)}
        className="focus-ring inline-flex cursor-pointer items-center rounded-md border border-action/30 bg-action/[0.08] px-1 py-px font-mono text-[9px] font-black text-action transition hover:bg-action/[0.16]"
      >
        {text}
      </button>
    </sup>
  );
}

export function AgentMessageContent({ content, compact = false }: AgentMessageContentProps) {
  const safeContent = normalizeAgentTextContent(content);
  return (
    <div
      data-agent-message-content
      dir="auto"
      className={`min-w-0 break-words text-start ${compact ? "text-sm leading-6" : "text-[15px] leading-7"}`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
          h1: ({ children }) => <h2 className="mb-2 mt-5 text-lg font-bold leading-7 tracking-[-0.015em] first:mt-0">{children}</h2>,
          h2: ({ children }) => <h3 className="mb-2 mt-5 text-base font-bold leading-7 first:mt-0">{children}</h3>,
          h3: ({ children }) => <h4 className="mb-2 mt-4 text-[15px] font-bold leading-6 first:mt-0">{children}</h4>,
          h4: ({ children }) => <h5 className="mb-2 mt-4 text-sm font-bold leading-6 first:mt-0">{children}</h5>,
          ul: ({ children }) => <ul className="mb-3 ms-5 list-disc space-y-1.5 marker:text-fg-subtle last:mb-0">{children}</ul>,
          ol: ({ children }) => <ol className="mb-3 ms-5 list-decimal space-y-1.5 marker:font-semibold marker:text-fg-muted last:mb-0">{children}</ol>,
          li: ({ children }) => <li className="ps-1">{children}</li>,
          strong: ({ children }) => <strong className="font-bold text-fg">{children}</strong>,
          blockquote: ({ children }) => <blockquote className="my-3 border-s-2 border-action/45 ps-3 text-fg-muted">{children}</blockquote>,
          hr: () => <hr className="my-5 border-0 border-t border-hairline" />,
          a: ExternalLink,
          table: TableShell,
          thead: ({ children }) => <thead className="bg-surface-2 text-fg">{children}</thead>,
          tbody: ({ children }) => <tbody className="divide-y divide-hairline">{children}</tbody>,
          tr: ({ children }) => <tr>{children}</tr>,
          th: ({ children }) => <th className="border-r border-hairline px-3 py-2 font-bold last:border-r-0">{children}</th>,
          td: ({ children }) => <td className="border-r border-hairline px-3 py-2 align-top text-fg-muted last:border-r-0">{children}</td>,
          code: ({ children, className }) => className ? (
            <code className={className}>{children}</code>
          ) : (
            <EvidenceRefSup>{children}</EvidenceRefSup>
          ),
          pre: ({ children }) => <pre className="my-4 max-w-full overflow-x-auto rounded-xl bg-surface-inverse p-4 font-mono text-xs leading-5 text-fg-inverse">{children}</pre>
        }}
      >
        {renderAgentEvidenceRefs(safeContent)}
      </ReactMarkdown>
    </div>
  );
}
