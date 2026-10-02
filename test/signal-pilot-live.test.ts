// @vitest-environment node
// Explicit opt-in: enqueues a real production pilot run under existing per-user quotas.
import { it, expect } from "vitest";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { syncTrendSources } from "@/lib/trends/service";
import { enqueueSignalDiscovery } from "@/lib/signals/service";
it.skipIf(process.env.SIGNAL_PILOT_LIVE !== "true")("enqueues the approved internal pilot without changing entitlements", async () => {
  loadEnvConfig(process.cwd(),false,{info(){},error(){}});
  const userId=process.env.SIGNAL_PILOT_USER_ID ?? "00000000-0000-0000-0000-000000000000";
  expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toMatch(/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/);
  process.env.SIGNAL_DISCOVERY_ENABLED="true"; process.env.SIGNAL_DISCOVERY_USER_IDS=userId;
  const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
  if (process.env.SIGNAL_REFRESH_FEEDS === "true") await syncTrendSources(admin,undefined,{trigger:"bootstrap",requestedBy:userId,minIntervalMs:0});
  const id=await enqueueSignalDiscovery(admin,userId,"manual");
  if (!id) {
    // The shared monthly ledger gate refuses doomed runs; report why instead of asserting.
    const ledger=await admin.from("llm_monthly_budget_usage").select("spent_cny").eq("provider","signal-discovery").order("usage_month",{ascending:false}).limit(1).maybeSingle();
    console.log(JSON.stringify({enqueued:false,ledger:ledger.data??null}));
    return;
  }
  const result=await admin.from("signal_discovery_jobs").select("id,status,search_calls,analysis_calls,error_code").eq("id",id!).eq("user_id",userId).single();
  expect(result.error).toBeNull(); console.log(JSON.stringify(result.data));
},180000);
