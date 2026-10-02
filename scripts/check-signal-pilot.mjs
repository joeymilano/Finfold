// Read-only pilot evidence. Never prints credentials, the private profile or page bodies.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
require("@next/env").loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const { createClient } = require("@supabase/supabase-js");
const userId = process.argv[2];
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId ?? "")) {
  throw new Error("Pass the approved pilot user UUID.");
}
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("The existing database environment is required.");
}
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const results = await Promise.all([
  admin.from("signal_discovery_jobs").select("id,status,state,created_at,updated_at,search_calls,analysis_calls,error_code")
    .eq("user_id", userId).order("created_at", { ascending: false }).limit(3),
  admin.from("signal_discovery_daily_usage").select("usage_day,search_calls,analysis_calls")
    .eq("user_id", userId).order("usage_day", { ascending: false }).limit(4),
  admin.from("trend_collection_runs").select("id,status,started_at,completed_at,collected_count,persisted_count,source_report,error_message")
    .order("started_at", { ascending: false }).limit(2),
  admin.from("llm_monthly_budget_usage").select("usage_month,spent_cny")
    .eq("provider", "signal-discovery").order("usage_month", { ascending: false }).limit(1)
]);
for (const result of results) if (result.error) throw new Error(`Pilot read failed: ${result.error.code}`);
const reference = process.argv[3] ? JSON.parse(readFileSync(process.argv[3], "utf8")) : null;
if (reference && reference.pilotUserId !== userId) throw new Error("Reference set belongs to a different pilot profile.");
const referenceCheck = reference ? {
  referenceStatus: reference.status, targetCount: reference.targetCount, currentCount: reference.items.length,
  expectedUseful: reference.items.filter(item => item.label === "useful").length,
  isQualityAcceptance: false,
  jobs: results[0].data.map(job => ({ jobId: job.id, jobStatus: job.status,
    prospective: Date.parse(job.created_at) > Date.parse(reference.curatedAt),
    items: reference.items.map(item => {
      const candidate = job.state.candidates.find(candidate => candidate.url === item.url);
      return { url: item.url, expected: item.label, recalled: !!candidate, candidateStatus: candidate?.status ?? "not_found",
        opportunityId: candidate?.opportunityId ?? null };
    })
  }))
} : undefined;
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), jobs: results[0].data.map(({ state, ...job }) => ({
  ...job, sources: state.sources, readCount: state.readCount, recommended: state.recommended,
  queryPlan: state.queryPlan, queries: state.queries,
  distinctOpportunityCount: new Set(state.candidates.filter(candidate => candidate.status === "recommended" && candidate.opportunityId)
    .map(candidate => candidate.opportunityId)).size,
  candidates: state.candidates.map(({ title, url, sourceLabel, publishedAt, status, reason, excerpt, opportunityId }) =>
    ({ title, url, sourceLabel, publishedAt, status, reason, excerpt, opportunityId }))
})), dailyUsage: results[1].data, collectionRuns: results[2].data, referenceCheck,
  sharedReservation: { entries: results[3].data, isActualProviderBill: false } }, null, 2));
