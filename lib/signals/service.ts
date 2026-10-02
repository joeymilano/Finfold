import type { createSupabaseAdminClient } from "@/lib/supabase";
import { getActiveSubscription, getPlanFeatures, resolveEffectivePlan } from "@/lib/payment/entitlements";
import { ensurePlanCredits, getAvailableCredits, refundCredits } from "@/lib/payment/credits";
import { ACTION_CREDITS, type PlanId } from "@/lib/payment/types";
import { logInfo } from "@/lib/observability";
import { runJevItemReviewBatch } from "@/lib/jev-review";
import { loadSignalDiscoveryPreferences } from "@/lib/signals/preferences";
import { loadPersonalizationContext, loadNegativeFeedbackTerms, persistSignals, clusterSignals } from "@/lib/trends/service";
import { buildOpportunityProfile } from "@/lib/trends/scoring";
import { loadTrendSourcePreferences, isTrendSourceEnabled } from "@/lib/trends/source-preferences";
import { searchPublicWebByQuery } from "@/lib/agent/web-search-evidence";
import { readSignalCandidate } from "@/lib/signals/evidence";
import { searchNativeHackerNews } from "@/lib/signals/native-search";
import { assessCandidate, discoveryProviders, planDiscoveryQueries } from "@/lib/signals/model";
import { buildDiscoveryQueries, canonicalSignalUrl, signalUrlFingerprint, isSignalArticleUrl, candidateRecallScore, nextSignalCandidate, mergeCandidates, verifiedAssessment, assessmentFailure, countRecommendedOpportunities,
  PRESCREEN_MIN_CANDIDATES, PRESCREEN_QUESTION_STEMS, applyPrescreenVerdicts,
  type SignalCandidate, type SignalAssessment, type DiscoveryState, type DiscoveryStatus } from "@/lib/signals/contracts";

type Admin = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
export type DiscoveryJob = { id: string; user_id: string; profile_version: string; status: "queued" | "running" | "completed" | "partial" | "failed" | "cancelled";
  state: DiscoveryState; lease_token: string; search_calls: number; analysis_calls: number; retry_count: number; updated_at: string; error_code: string | null; trigger_kind: "manual" | "scheduled" };
const JOB_FIELDS = "id,user_id,profile_version,status,state,lease_token,search_calls,analysis_calls,retry_count,updated_at,error_code,trigger_kind";
export const discoveryEnabled = () => process.env.SIGNAL_DISCOVERY_ENABLED === "true";

export function discoveryUserAllowed(userId: string): boolean {
  const ids = (process.env.SIGNAL_DISCOVERY_USER_IDS ?? "").split(",").map(id => id.trim()).filter(Boolean);
  return !ids.length || ids.includes(userId);
}

/** Discovery bills the user's plan Credits per call; prices mirror ACTION_CREDITS. */
export function discoveryCallCost(kind: "search" | "analysis"): number {
  return kind === "search" ? ACTION_CREDITS.signalDiscoverySearch : ACTION_CREDITS.signalDiscoveryAnalysis;
}

/** A full run is capped at 8 searches + 12 analysis calls by the job schema. */
export function estimatedDiscoveryRunCost(): number {
  return 8 * ACTION_CREDITS.signalDiscoverySearch + 12 * ACTION_CREDITS.signalDiscoveryAnalysis;
}

async function resolveUserPlan(admin: Admin, userId: string): Promise<PlanId | "free"> {
  const [p, s] = await Promise.all([
    admin.from("profiles").select("plan").eq("id", userId).maybeSingle(),
    admin.from("subscriptions").select("status,current_period_end").eq("user_id", userId).eq("payment_provider", "creem").order("updated_at", { ascending: false })
  ]);
  if (p.error || s.error) throw p.error ?? s.error;
  const active = getActiveSubscription((s.data ?? []).map(row => ({ status: row.status, currentPeriodEnd: row.current_period_end })));
  return resolveEffectivePlan(p.data?.plan, active);
}

/** available < 0 means "could not read"; callers must not treat that as empty. */
export async function loadDiscoveryCredits(admin: Admin, userId: string): Promise<{ available: number; minimumRunCost: number }> {
  const minimumRunCost = discoveryCallCost("analysis") + discoveryCallCost("search");
  try {
    const plan = await resolveUserPlan(admin, userId);
    await ensurePlanCredits(userId, plan);
    return { available: await getAvailableCredits(userId), minimumRunCost };
  } catch {
    // Fail open here: the per-call RPC still fails closed on the real balance.
    return { available: -1, minimumRunCost };
  }
}

export async function canDiscover(admin: Admin, userId: string, scheduled = false): Promise<boolean> {
  if (!discoveryUserAllowed(userId)) return false;
  if (!(await loadSignalDiscoveryPreferences(admin, userId)).enabled) return false;
  const plan = await resolveUserPlan(admin, userId);
  const features = getPlanFeatures(plan);
  return scheduled ? features.proactiveMonitoring : features.agentTools;
}

export async function enqueueSignalDiscovery(admin: Admin, userId: string, trigger: "manual" | "scheduled" = "manual"): Promise<string | null> {
  if (!discoveryEnabled()) return null;
  if (!await canDiscover(admin, userId, trigger === "scheduled")) return null;
  // A job whose first charge cannot succeed only burns a claim slot and reads
  // as a silent 0/8 run; check the user's Credits before queueing.
  const credits = await loadDiscoveryCredits(admin, userId);
  if (credits.available >= 0 && credits.available < credits.minimumRunCost) return null;
  const context = await loadPersonalizationContext(admin, userId);
  const profile = { ...buildOpportunityProfile(context), negativeTerms: await loadNegativeFeedbackTerms(admin, userId) };
  const enabled = await loadTrendSourcePreferences(admin, userId);
  const epoch = Math.floor(Date.now() / (8 * 3600_000));
  const windowMs = trigger === "manual" ? 15 * 60_000 : 8 * 3600_000;
  const queries = buildDiscoveryQueries(profile, epoch, enabled);
  if (!profile.businessText && !profile.audienceText && !profile.watchlist?.length) return null;
  const state: DiscoveryState = { profile, profileVersion: context.profileVersion, phase: "search", queries, queryIndex: 0,
    candidates: [], readCount: 0, recommended: 0, queryPlan: queries.length ? { status: "pending", terms: [] } : undefined,
    sources: queries.map(q => ({ platform: q.platform, label: q.label, status: "pending", found: 0 })) };
  // Only one collector owns a user at once; execution checks current preferences.
  const running = await admin.from("signal_discovery_jobs").select("id,profile_version").eq("user_id", userId).in("status", ["queued", "running"]).maybeSingle();
  if (running.error) throw running.error;
  if (running.data) return String(running.data.id);
  const inserted = await admin.from("signal_discovery_jobs").upsert({ user_id: userId, profile_version: context.profileVersion,
    window_start: new Date(Math.floor(Date.now() / windowMs) * windowMs).toISOString(), trigger_kind: trigger, state },
    { onConflict: "user_id,profile_version,window_start", ignoreDuplicates: true }).select("id").maybeSingle();
  if (inserted.error && inserted.error.code !== "23505") throw inserted.error;
  if (inserted.data) return String(inserted.data.id);
  const latest = await admin.from("signal_discovery_jobs").select("id").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (latest.error) throw latest.error;
  return latest.data ? String(latest.data.id) : null;
}

export async function loadSignalDiscoveryStatus(admin: Admin, userId: string): Promise<DiscoveryStatus> {
  const empty: DiscoveryStatus = { status: discoveryEnabled() && discoveryUserAllowed(userId) ? "not_started" : "disabled", searchCalls: 0, readCount: 0, recommended: 0, sources: [], candidates: [] };
  if (!discoveryEnabled() || !discoveryUserAllowed(userId)) return empty;
  const [preferences, credits] = await Promise.all([loadSignalDiscoveryPreferences(admin, userId), loadDiscoveryCredits(admin, userId)]);
  const creditStatus = { userDisabled: !preferences.enabled,
    credits: { available: credits.available, searchCost: discoveryCallCost("search"), analysisCost: discoveryCallCost("analysis"), estimatedRunCost: estimatedDiscoveryRunCost() },
    insufficientCredits: credits.available >= 0 && credits.available < credits.minimumRunCost };
  const { data, error } = await admin.from("signal_discovery_jobs").select(JOB_FIELDS).eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) return { ...empty, status: "failed", error: "discovery_storage_unavailable" };
  if (!data) return { ...empty, ...creditStatus };
  const job = data as DiscoveryJob;
  const enabled = await loadTrendSourcePreferences(admin, userId);
  const sources = (job.state.sources ?? []).filter(s => enabled.has(s.platform as never));
  const candidates = (job.state.candidates ?? []).filter(c => isTrendSourceEnabled("web_search", c.sourceLabel, enabled));
  const recommendedIds = candidates.flatMap(c => c.status === "recommended" && c.opportunityId ? [c.opportunityId] : []);
  if (recommendedIds.length) {
    const reviewed = await admin.from("topic_opportunities").select("id,state,feedback").eq("user_id", userId).in("id", recommendedIds);
    if (reviewed.error) throw reviewed.error;
    const active = new Set((reviewed.data ?? []).filter(r => r.state === "active" && !r.feedback).map(r => r.id));
    for (const candidate of candidates) if (candidate.opportunityId && !active.has(candidate.opportunityId)) {
      candidate.status = "assessed"; candidate.reason = "已保留你的处理决定，本轮不重复推荐。";
    }
  }
  return { status: job.status, id: job.id, updatedAt: job.updated_at, error: job.error_code,
    searchCalls: job.search_calls, readCount: job.state.readCount, recommended: countRecommendedOpportunities(candidates),
    sources, candidates: candidates.map(c => ({ ...c, text: "", snippet: c.snippet.slice(0, 300) })), prescreen: job.state.prescreen, ...creditStatus };
}

/** Charges the user's Credits atomically with the quota counters; returns the
 * charged amount, or null when the lease/caps/balance denied the call. */
async function reserveCall(admin: Admin, job: DiscoveryJob, kind: "search" | "analysis"): Promise<number | null> {
  const action = kind === "search" ? "signalDiscoverySearch" : "signalDiscoveryAnalysis";
  const { data, error } = await admin.rpc("reserve_signal_discovery_call", { p_job_id: job.id, p_lease_token: job.lease_token, p_kind: kind,
    p_action: action, p_amount: discoveryCallCost(kind) });
  if (error) throw error;
  return data === true ? discoveryCallCost(kind) : null;
}

async function seedCandidates(admin: Admin, job: DiscoveryJob): Promise<SignalCandidate[]> {
  const { data, error } = await admin.from("trend_signals").select("source,source_label,source_url,title,summary,published_at,evidence_payload")
    .or(`owner_user_id.is.null,owner_user_id.eq.${job.user_id}`).gte("last_observed_at", new Date(Date.now() - 7 * 86400_000).toISOString())
    .order("captured_at", { ascending: false }).limit(500);
  if (error) throw error;
  const enabled = await loadTrendSourcePreferences(admin, job.user_id);
  const candidates = (data ?? []).filter(r => isTrendSourceEnabled(r.source, r.source_label, enabled)).flatMap((row): SignalCandidate[] => {
    try {
      const payload = row.evidence_payload as Record<string, unknown> | null;
      const api = payload?.evidenceLevel === "public_api";
      return [{ url: canonicalSignalUrl(row.source_url), title: row.title, snippet: row.summary, sourceLabel: row.source_label,
        platform: typeof payload?.provider === "string" ? payload.provider : row.source, publishedAt: row.published_at,
        evidenceLevel: api ? "public_api" : "indexed", text: api ? row.summary : "", status: "pending" }];
    } catch { return []; }
  });
  const limit = enabled.has("hacker_news") && job.state.queryPlan?.communityQuery ? 10 : 14;
  return mergeCandidates([], candidates.filter(c => isSignalArticleUrl(c.url)).sort((a, b) => candidateRecallScore(b, job.state.profile, job.state.queryPlan?.terms) - candidateRecallScore(a, job.state.profile, job.state.queryPlan?.terms)).slice(0, limit));
}

async function publishCandidate(admin: Admin, job: DiscoveryJob, candidate: SignalCandidate, assessment: SignalAssessment): Promise<string | null> {
  const fingerprint = await signalUrlFingerprint(candidate.url);
  const persisted = await persistSignals(admin, [{ ownerUserId: job.user_id, scopeKey: `user:${job.user_id}`, source: "web_search", sourceItemId: fingerprint,
    sourceUrl: candidate.url, sourceLabel: candidate.sourceLabel, title: candidate.title, summary: assessment.fact, locale: /[\u3400-\u9fff]/.test(assessment.fact) ? "zh-CN" : "en",
    publishedAt: candidate.publishedAt ?? undefined, momentumScore: 0, fingerprint,
    evidencePayload: { provider: candidate.platform, evidenceLevel: candidate.evidenceLevel, excerpt: assessment.excerpt, signalKind: assessment.kind, contentKind: assessment.contentKind ?? "industry_post", demandStatus: assessment.demandStatus ?? "not_applicable" } }]);
  if (!persisted.rows.length) throw new Error("signal_persistence_failed");
  await clusterSignals(admin, persisted.rows);
  const linked = await admin.from("trend_event_signals").select("event_id").eq("signal_id", persisted.rows[0].id).single();
  if (linked.error) throw linked.error;
  const existing = await admin.from("topic_opportunities").select("id,state,feedback").eq("user_id", job.user_id).eq("event_id", linked.data.event_id).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data?.feedback || (existing.data && existing.data.state !== "active")) return null;
  const result = await admin.from("topic_opportunities").upsert({ user_id: job.user_id, event_id: linked.data.event_id,
    match_score: assessment.matchScore, rank_score: assessment.matchScore, match_dimensions: { matchedTerms: [], signalKind: assessment.kind, evidenceLevel: candidate.evidenceLevel },
    why_now: assessment.whyNow, why_you: assessment.whyYou, main_angle: assessment.action, alternate_angles: [],
    recommended_platform: job.state.profile.preferredPlatform ?? job.state.profile.platforms?.[0] ?? "linkedin", recommended_format: /[\u3400-\u9fff]/.test(assessment.fact) ? "附原文证据的业务洞察" : "Evidence-backed insight",
    evidence_confidence: 70, analysis_status: "personalized", analysis_cache_key: `discovery:${job.profile_version}:${fingerprint}`,
    analysis_expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(), updated_at: new Date().toISOString() }, { onConflict: "user_id,event_id" }).select("id").single();
  if (result.error) throw result.error;
  if (assessment.kind === "demand") {
    const old = await admin.from("public_demand_signals").select("id").eq("user_id", job.user_id).eq("source", "business-discovery").eq("source_item_id", result.data.id).maybeSingle();
    if (old.error) throw old.error;
    const values = { title: candidate.title, excerpt: assessment.excerpt, discussion_url: candidate.url, external_url: candidate.url,
      published_at: candidate.publishedAt, last_seen_at: new Date().toISOString(), matched_keywords: job.state.profile.watchlist?.slice(0, 8) ?? [] };
    const saved = old.data
      ? await admin.from("public_demand_signals").update(values).eq("id", old.data.id).eq("user_id", job.user_id)
      : await admin.from("public_demand_signals").insert({ ...values, user_id: job.user_id, source: "business-discovery", source_item_id: result.data.id, first_seen_at: values.last_seen_at });
    if (saved.error) throw saved.error;
  } else {
    // A reclassified article may retain its useful opportunity, but an old,
    // unreviewed demand projection must not remain in the demand queue.
    const removed = await admin.from("public_demand_signals").delete().eq("user_id", job.user_id)
      .eq("source", "business-discovery").eq("source_item_id", result.data.id)
      .eq("status", "new").is("reviewed_at", null);
    if (removed.error) throw removed.error;
  }
  return String(result.data.id);
}

export async function processSignalDiscovery(admin: Admin): Promise<{ claimed: number; status?: string }> {
  if (!discoveryEnabled()) return { claimed: 0 };
  const claimed = await admin.rpc("claim_signal_discovery_job").maybeSingle();
  if (claimed.error) throw claimed.error;
  if (!claimed.data) return { claimed: 0 };
  const job = claimed.data as DiscoveryJob;
  let state = job.state;
  // Credits charged in this step; refunded when the step itself fails (failure must never bill).
  let chargedCredits = 0;
  const spendAnalysis = async (): Promise<boolean> => {
    const amount = await reserveCall(admin, job, "analysis");
    if (amount === null) throw new Error("insufficient_credits");
    chargedCredits += amount;
    return true;
  };
  const spendSearch = async (): Promise<boolean> => {
    // Boolean false lets the search layer mark the source budget_exhausted
    // without turning the denial into a retryable step error.
    const amount = await reserveCall(admin, job, "search");
    if (amount === null) return false;
    chargedCredits += amount;
    return true;
  };
  try {
    if (!await canDiscover(admin, job.user_id, job.trigger_kind === "scheduled")) {
      await finish(admin, job, state, "cancelled", "access_changed"); return { claimed: 1, status: "cancelled" };
    }
    const current = await loadPersonalizationContext(admin, job.user_id);
    if (current.profileVersion !== job.profile_version) {
      await finish(admin, job, state, "cancelled", "profile_changed"); return { claimed: 1, status: "cancelled" };
    }
    const enabled = await loadTrendSourcePreferences(admin, job.user_id);
    state.candidates = state.candidates.filter(c => isSignalArticleUrl(c.url) && isTrendSourceEnabled("web_search", c.sourceLabel, enabled));
    const providers = discoveryProviders();
    if (!providers.length) {
      state.sources = state.sources.map(s => ({ ...s, status: "not_configured" }));
      await finish(admin, job, state, "partial", "model_not_configured"); return { claimed: 1, status: "partial" };
    }
    if (state.queryPlan?.status === "pending") {
      try {
        const plan = await planDiscoveryQueries(state.profile, state.queries, providers[0], spendAnalysis);
        state.queries = plan.queries; state.queryPlan = { status: "ready", terms: plan.terms, communityQuery: plan.communityQuery };
      } catch (error) {
        if (error instanceof Error && ["budget_exhausted", "insufficient_credits"].includes(error.message)) throw error;
        state.queryPlan = { status: "fallback", terms: [], error: "query_plan_failed" };
      }
      // Planning consumes one of the existing 12 analysis slots, not extra quota.
      state.phase = "read";
      await finish(admin, job, state, "queued", null);
      return { claimed: 1, status: "queued" };
    }
    if (!state.seedVersion) {
      state.candidates = mergeCandidates(state.candidates, await seedCandidates(admin, job)); state.seedVersion = 2;
      if (enabled.has("hacker_news") && state.queryPlan?.communityQuery) {
        const native = await searchNativeHackerNews(state.queryPlan.communityQuery);
        state.sources.push(native.report); state.candidates = mergeCandidates(state.candidates, native.candidates);
      }
      // Keep source reads in their own leased step, below the cron's 60s timeout.
      await finish(admin, job, state, "queued", null); return { claimed: 1, status: "queued" };
    }
    // Blocked pages consume a read, not an analysis. Keep the original 12-read cap;
    // the shared reservation RPC separately enforces 12 total model calls, including planning.
    const readLimit = 12;
    if (state.phase === "search" && state.queryIndex < state.queries.length) {
      const query = state.queries[state.queryIndex];
      const report = state.sources[state.queryIndex];
      if (enabled.has(query.platform as never)) {
        const result = await searchPublicWebByQuery({ query: query.query, domains: query.domains, language: query.language, since: new Date(Date.now() - 7 * 86400_000).toISOString() },
          { providers: [...providers.slice(state.sources.filter(s => s.status === "failed").length % providers.length), ...providers.slice(0, state.sources.filter(s => s.status === "failed").length % providers.length)], maxAttempts: 1, beforeAttempt: spendSearch });
        if (result.available) {
          const incoming: SignalCandidate[] = result.sources.map(s => ({ url: s.url, title: s.title, snippet: s.snippet, sourceLabel: query.label,
            platform: query.platform, publishedAt: null, evidenceLevel: "indexed", text: "", status: "pending" }));
          state.candidates = mergeCandidates(state.candidates, incoming.filter(c => isSignalArticleUrl(c.url))
            .sort((a, b) => candidateRecallScore(b, state.profile, state.queryPlan?.terms) - candidateRecallScore(a, state.profile, state.queryPlan?.terms)).slice(0, 2));
          report.status = "available"; report.found = result.sources.length;
        } else {
          report.status = result.reason === "provider_failed" ? "failed" : result.reason === "no_sources" ? "no_results" : result.reason;
          if (report.status === "failed") {
            // The provider call itself failed after a successful charge.
            await refundCredits(job.user_id, ACTION_CREDITS.signalDiscoverySearch, "refund", { jobId: job.id, reason: "search_provider_failed" });
            chargedCredits -= ACTION_CREDITS.signalDiscoverySearch;
          }
        }
      } else report.status = "no_results";
      state.queryIndex++;
      state.phase = "read";
    } else {
      state.phase = "read";
      // Jev prescreen owns its own leased step: a retry storm must never share
      // the 60s cron budget with a read+assess pass. Fail-open on any error.
      const unscreened = state.candidates.filter(c => c.status === "pending" && !c.prescreen);
      if (unscreened.length >= PRESCREEN_MIN_CANDIDATES) {
        try {
          const { model, answers } = await runJevItemReviewBatch({
            items: unscreened.map(c => ({ title: c.title, snippet: c.snippet, source_label: c.sourceLabel, url: c.url })),
            questions: PRESCREEN_QUESTION_STEMS,
            brandContext: [state.profile.brandName, state.profile.businessText, state.profile.audienceText].filter(Boolean).join(" · ") || null,
            note: "Candidates are search-indexed titles and snippets. Judge relevance only from title and snippet; the full page has not been read.",
            operation: "signals_prescreen",
            userId: job.user_id
          });
          const rejected = applyPrescreenVerdicts(unscreened, answers);
          const skipped = (state.prescreen?.skipped ?? 0) + rejected;
          state.prescreen = { skipped, savedCredits: skipped * ACTION_CREDITS.signalDiscoveryAnalysis };
          logInfo("signals_prescreen_completed", { userId: job.user_id }, { rejected, kept: unscreened.length - rejected, model });
          if (state.queryIndex < state.queries.length) state.phase = "search";
          await finish(admin, job, state, "queued", null);
          return { claimed: 1, status: "queued" };
        } catch { /* No marks, no early return — this step reads+assesses as before. */ }
      }
      const candidate = nextSignalCandidate(state.candidates, state.profile, state.queryPlan?.terms);
      if (candidate && state.readCount < readLimit) {
        const read = await readSignalCandidate(candidate);
        Object.assign(candidate, read); state.readCount++;
        if (read.status !== "blocked") {
          const raw = await assessCandidate(read, state.profile, providers[job.retry_count % providers.length], spendAnalysis);
          const assessment = verifiedAssessment(raw, read);
          if (!assessment) { candidate.status = "rejected"; candidate.reason = assessmentFailure(raw, read) ?? "原文校验未通过。"; }
          else if (!assessment.relevant || assessment.matchScore < 70) { candidate.status = "assessed"; candidate.reason = assessment.whyYou; }
          else {
            candidate.excerpt = assessment.excerpt;
            const opportunityId = await publishCandidate(admin, job, candidate, assessment);
            if (opportunityId) {
              candidate.opportunityId = opportunityId; candidate.status = "recommended"; candidate.reason = assessment.whyYou;
            } else { candidate.status = "assessed"; candidate.reason = "已保留你对此内容的处理决定，本轮不重复推荐。"; }
          }
        }
      }
      if (state.queryIndex < state.queries.length) state.phase = "search";
    }
    state.recommended = countRecommendedOpportunities(state.candidates);
    const done = state.queryIndex >= state.queries.length && (state.readCount >= readLimit || !state.candidates.some(c => c.status === "pending" && c.prescreen !== "rejected"));
    const partial = state.sources.some(s => ["failed", "budget_exhausted", "not_configured"].includes(s.status));
    await finish(admin, job, state, done ? partial ? "partial" : "completed" : "queued", done && !state.recommended ? "no_qualified_signals" : null);
    return { claimed: 1, status: done ? partial ? "partial" : "completed" : "queued" };
  } catch (error) {
    const code = error instanceof Error && /^[a-z_0-9]+$/.test(error.message) ? error.message : "discovery_step_failed";
    const exhausted = code === "budget_exhausted" || code === "insufficient_credits";
    // Failure must never bill: refund what this step charged before retrying.
    if (!exhausted && chargedCredits > 0) await refundCredits(job.user_id, chargedCredits, "refund", { jobId: job.id, reason: code });
    // Reload original state on retry so a failed assessment does not consume a read slot.
    if (!exhausted) { const original = await admin.from("signal_discovery_jobs").select("state").eq("id", job.id).single(); if (original.data) state = original.data.state as DiscoveryState; }
    await finish(admin, job, state, exhausted ? "partial" : job.retry_count >= 2 ? "failed" : "queued", code, true);
    return { claimed: 1, status: exhausted ? "partial" : "retry" };
  }
}

async function finish(admin: Admin, job: DiscoveryJob, state: DiscoveryState, status: DiscoveryJob["status"], errorCode: string | null, retry = false): Promise<void> {
  const terminal = status !== "queued";
  if (terminal) state = { ...state, candidates: state.candidates.map(c => ({ ...c, text: "",
    ...(c.status === "pending" && !c.reason ? { reason: errorCode === "budget_exhausted" || errorCode === "insufficient_credits" ? "套餐 Credits 不足，本轮未完成此候选的原文核对。" : "本轮未核对该候选，暂不作为推荐。" } : {}) })) };
  const { data, error } = await admin.from("signal_discovery_jobs").update({ state, status, error_code: errorCode, lease_token: null, lease_until: null,
    retry_count: retry ? job.retry_count + 1 : 0, updated_at: new Date().toISOString(), completed_at: terminal ? new Date().toISOString() : null,
    due_at: new Date(Date.now() + (retry ? [60, 300, 1800][Math.min(job.retry_count, 2)] * 1000 : 0)).toISOString() })
    .eq("id", job.id).eq("lease_token", job.lease_token).eq("status", "running").select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("discovery_lease_lost");
}
