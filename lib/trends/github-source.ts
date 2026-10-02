import { JSON_CONTENT_TYPES, readTextWithLimit, safeExternalFetch } from "@/lib/safe-url";
import { stableTrendFingerprint } from "@/lib/trends/scoring";
import type { TrendSignalInput, TrendSourceAdapter, TrendSourceResult, TrendSourceFetchState } from "@/lib/trends/types";

export class GitHubTrendAdapter implements TrendSourceAdapter {
  readonly id = "social_post" as const;
  get stateKey() { return `github:${this.repository}`; }
  get label() { return `GitHub · ${this.repository}`; }
  constructor(private readonly repository: string) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error("Invalid public repository.");
  }

  async collect(state?: TrendSourceFetchState): Promise<TrendSourceResult> {
    const fetchedAt = new Date().toISOString();
    const cooldown = Date.parse(state?.retryAfter ?? "");
    if (Number.isFinite(cooldown) && cooldown > Date.now() && cooldown <= Date.now() + 24 * 3600_000) {
      return { source: this.id, label: this.label, ok: false, fetchedAt, signals: [], retryAfter: state!.retryAfter,
        error: `GitHub rate limit cooldown until ${state!.retryAfter}; no request dispatched.` };
    }
    try {
      const response = await safeExternalFetch(`https://api.github.com/repos/${this.repository}/issues?state=open&sort=updated&per_page=15`, {
        headers: { accept: "application/vnd.github+json", "User-Agent": "FinfoldOpportunityRadar/1.0" }
      }, { allowedContentTypes: JSON_CONTENT_TYPES, timeoutMs: 8000, auditPurpose: "github_public_signal" });
      if (response.status === 403 || response.status === 429) {
        const now = Date.now(), reset = Number(response.headers.get("x-ratelimit-reset")) * 1000;
        const retry = response.headers.get("retry-after"), retryTime = retry && /^\d+$/.test(retry) ? now + Number(retry) * 1000 : Date.parse(retry ?? "");
        const times = [reset, retryTime].filter(time => Number.isFinite(time) && time > now);
        const retryAfter = times.length ? new Date(Math.min(now + 24 * 3600_000, Math.max(...times))).toISOString() : undefined;
        await response.body?.cancel();
        return { source: this.id, label: this.label, ok: false, fetchedAt, signals: [], retryAfter,
          error: `GitHub returned HTTP ${response.status}${retryAfter ? `; retry after ${retryAfter}` : "."}` };
      }
      if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}; retry after ${response.headers.get("x-ratelimit-reset") ?? "next collection"}.`);
      const rows: unknown = JSON.parse(await readTextWithLimit(response, 512 * 1024));
      if (!Array.isArray(rows)) throw new Error("GitHub did not return issues.");
      const signals = rows.flatMap((value): TrendSignalInput[] => {
        if (!value || typeof value !== "object") return [];
        const row = value as Record<string, unknown>;
        if (row.pull_request || typeof row.html_url !== "string" || typeof row.title !== "string") return [];
        const url = new URL(row.html_url);
        if (url.protocol !== "https:" || url.hostname !== "github.com" || !url.pathname.startsWith(`/${this.repository}/issues/`)) return [];
        const publishedAt = typeof row.created_at === "string" && Number.isFinite(Date.parse(row.created_at)) ? row.created_at : undefined;
        return [{ source: this.id, scopeKey: "global", sourceItemId: `github:${this.repository}:${row.number}`, sourceUrl: url.href,
          sourceLabel: this.label, title: row.title.slice(0, 300), summary: String(row.body ?? "").slice(0, 1200), locale: "en", publishedAt,
          momentumScore: 45, evidencePayload: { provider: "github", contentKind: "industry_post", comments: typeof row.comments === "number" ? row.comments : null,
            fetchStateKey: this.stateKey, evidenceLevel: "public_api" }, fingerprint: stableTrendFingerprint(url.href) }];
      }).slice(0, 8);
      return { source: this.id, label: this.label, ok: true, fetchedAt, signals };
    } catch (error) {
      return { source: this.id, label: this.label, ok: false, fetchedAt, signals: [], error: error instanceof Error ? error.message : "GitHub unavailable." };
    }
  }
}
