// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({ context:vi.fn(), preferences:vi.fn(), read:vi.fn(), assess:vi.fn(), plan:vi.fn(), native:vi.fn(), search:vi.fn(), persist:vi.fn(), cluster:vi.fn(), ensureCredits:vi.fn(), availableCredits:vi.fn(), refundCredits:vi.fn() }));
vi.mock("@/lib/trends/service",()=>({loadPersonalizationContext:mocks.context,loadNegativeFeedbackTerms:async()=>[],persistSignals:mocks.persist,clusterSignals:mocks.cluster}));
vi.mock("@/lib/trends/source-preferences",()=>({loadTrendSourcePreferences:mocks.preferences,isTrendSourceEnabled:()=>true}));
vi.mock("@/lib/payment/entitlements",()=>({getActiveSubscription:()=>null,resolveEffectivePlan:()=>"agent",getPlanFeatures:()=>({agentTools:true,proactiveMonitoring:true})}));
vi.mock("@/lib/payment/credits",()=>({ensurePlanCredits:mocks.ensureCredits,getAvailableCredits:mocks.availableCredits,refundCredits:mocks.refundCredits}));
vi.mock("@/lib/signals/evidence",()=>({readSignalCandidate:mocks.read}));
vi.mock("@/lib/signals/native-search",()=>({searchNativeHackerNews:mocks.native}));
vi.mock("@/lib/signals/model",()=>({discoveryProviders:()=>[{name:"test"}],assessCandidate:mocks.assess,planDiscoveryQueries:mocks.plan}));
vi.mock("@/lib/agent/web-search-evidence",()=>({searchPublicWebByQuery:mocks.search}));
import { discoveryUserAllowed, enqueueSignalDiscovery, loadSignalDiscoveryStatus, processSignalDiscovery, type DiscoveryJob } from "@/lib/signals/service";
const excerpt="Our small team needs a reliable content approval workflow across multiple accounts.";
const makeJob=():DiscoveryJob=>({ id:"job1",user_id:"user1",profile_version:"v1",lease_token:"lease1",status:"running",search_calls:0,analysis_calls:0,retry_count:0,updated_at:new Date().toISOString(),error_code:null,trigger_kind:"manual",state:{profile:{businessText:"content approval"},profileVersion:"v1",phase:"read",seedVersion:2,queries:[],queryIndex:0,readCount:1,recommended:0,sources:[],candidates:[{url:"https://example.com/request",title:"Approval workflow request",snippet:excerpt,sourceLabel:"公开网页",platform:"public_web",publishedAt:new Date().toISOString(),evidenceLevel:"public_api",text:excerpt.repeat(3),status:"pending"}]}});
function database(job:DiscoveryJob, reviewed=false){
  const writes:Array<{table:string;values:Record<string,unknown>}>=[];
  const original=structuredClone(job.state);
  const calls:Array<{table:string;method:string;args:unknown[]}>=[];
  const admin={rpc:vi.fn((name:string)=>{const value={data:name==="reserve_signal_discovery_call"?true:structuredClone(job),error:null};
    return Object.assign(Promise.resolve(value),{maybeSingle:async()=>value});}),from:vi.fn((table:string)=>{
    let mutated = false;
    const result=()=>({data:table==="profiles"?{plan:"agent"}:table==="subscriptions"||table==="trend_signals"?[]:table==="trend_event_signals"?{event_id:"event1"}:table==="topic_opportunities"?(mutated?{id:"opp1"}:reviewed?{id:"opp1",state:"dismissed",feedback:"not_relevant"}:null):{id:"job1",state:original},error:null});
    const chain:Record<string,unknown>={};
    for(const method of ["select","eq","in","order","limit","or","gte","is"]) chain[method]=vi.fn((...args:unknown[])=>{calls.push({table,method,args});return chain;});
    for(const method of ["update","upsert","insert"]) chain[method]=vi.fn((values:Record<string,unknown>)=>{mutated=true;writes.push({table,values});return chain;});
    chain.delete=vi.fn(()=>{calls.push({table,method:"delete",args:[]});return chain;});
    chain.maybeSingle=async()=>result();chain.single=async()=>result();chain.then=(fn:(value:unknown)=>unknown)=>Promise.resolve(result()).then(fn);
    return chain;
  })};return {admin:admin as never,writes,calls};
}
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("SIGNAL_DISCOVERY_ENABLED","true");mocks.context.mockResolvedValue({profileVersion:"v1"});mocks.preferences.mockResolvedValue(new Set(["public_web"]));mocks.ensureCredits.mockResolvedValue(undefined);mocks.availableCredits.mockResolvedValue(999);mocks.refundCredits.mockResolvedValue(undefined);mocks.read.mockImplementation(async c=>c);mocks.persist.mockResolvedValue({rows:[{id:"signal1"}]});mocks.cluster.mockResolvedValue(undefined);mocks.assess.mockResolvedValue({contentKind:"question",demandStatus:"unresolved",kind:"demand",relevant:true,matchScore:85,fact:excerpt,excerpt,whyYou:"This is directly related to the target customer's workflow.",whyNow:"A current original request.",action:"Evaluate the approval workflow against this specific problem."});});
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
it("keeps a previously dismissed signal out of recommendations and the demand projection",async()=>{
  const {admin,writes}=database(makeJob(),true);
  await processSignalDiscovery(admin);
  expect(writes.some(w=>w.table==="topic_opportunities"||w.table==="public_demand_signals")).toBe(false);
  const state=writes.find(w=>w.table==="signal_discovery_jobs")!.values.state as DiscoveryJob["state"];
  expect(state.candidates[0].status).toBe("assessed");expect(state.recommended).toBe(0);
});
it("persists distinct article identities and keeps tracking variants idempotent", async () => {
  for (const url of ["https://example.com/first", "https://example.com/second", "https://example.com/first?utm_source=feed"]) {
    const job = makeJob(); job.state.candidates[0].url = url;
    await processSignalDiscovery(database(job, true).admin);
  }
  const identities = mocks.persist.mock.calls.map(call => call[1][0].sourceItemId);
  expect(identities[0]).toMatch(/^[0-9a-f]{64}$/);
  expect(identities[0]).not.toBe(identities[1]);
  expect(identities[0]).toBe(identities[2]);
});
it("records provider failure separately from an empty successful search",async()=>{
  const job=makeJob();job.state.phase="search";job.state.queries=[{query:"workflow",platform:"public_web",label:"公开网页",domains:[],language:"en",kind:"demand"}];job.state.sources=[{platform:"public_web",label:"公开网页",status:"pending",found:0}];
  mocks.search.mockResolvedValue({available:false,reason:"provider_failed"});
  const {admin,writes}=database(job);await processSignalDiscovery(admin);
  expect((writes[0].values.state as DiscoveryJob["state"]).sources[0].status).toBe("failed");expect(mocks.assess).not.toHaveBeenCalled();
});
it("persists one bounded query plan and starts reading before all searches finish", async () => {
  const job = makeJob(); job.state.queryPlan = { status: "pending", terms: [] };
  const query = { query: "content approval", platform: "public_web", label: "Web", domains: [], language: "en", kind: "demand" as const };
  mocks.plan.mockResolvedValue({ queries: [query], terms: ["content approval"] });
  const { admin, writes } = database(job); await processSignalDiscovery(admin);
  expect(writes[0].values).toMatchObject({ status: "queued", state: { queryPlan: { status: "ready" }, phase: "read", queries: [query] } });
  expect(mocks.search).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
});
it("records a planning failure and falls back once without adding quota or hiding it", async () => {
  const job = makeJob(); job.state.queryPlan = { status: "pending", terms: [] };
  mocks.plan.mockRejectedValue(new Error("analysis_http_503"));
  const { admin, writes } = database(job); await processSignalDiscovery(admin);
  expect(writes[0].values).toMatchObject({ state: { queryPlan: { status: "fallback", error: "query_plan_failed" } } });
  expect(mocks.plan).toHaveBeenCalledTimes(1);
});
it("retains the original twelve-read ceiling independently of the analysis reservation cap", async () => {
  const job = makeJob(); job.state.queryPlan = { status: "ready", terms: [] }; job.state.readCount = 12;
  const { admin, writes } = database(job); await processSignalDiscovery(admin);
  expect(mocks.assess).not.toHaveBeenCalled(); expect(writes[0].values.status).toBe("completed");
});
it("uses a remaining original read slot after a blocked page without resetting analysis usage", async () => {
  const job = makeJob(); job.state.queryPlan = { status: "ready", terms: [] }; job.state.readCount = 11; job.analysis_calls = 11;
  const { admin, writes } = database(job, true); await processSignalDiscovery(admin);
  expect(mocks.assess).toHaveBeenCalledTimes(1);
  const saved = writes.find(write => write.table === "signal_discovery_jobs")!.values;
  expect(saved).toMatchObject({ state: { readCount: 12 } });
  expect(saved).not.toHaveProperty("analysis_calls");
});
it("collects native community evidence in a separate step only when the source is enabled", async () => {
  const job = makeJob(); delete job.state.seedVersion;
  job.state.queryPlan = { status: "ready", terms: ["marketing"], communityQuery: "marketing" };
  mocks.preferences.mockResolvedValue(new Set(["public_web", "hacker_news"]));
  mocks.native.mockResolvedValue({ report: { platform: "hacker_news", label: "HN", status: "available", found: 1 }, candidates: [] });
  const { admin, writes } = database(job); await processSignalDiscovery(admin);
  expect(mocks.native).toHaveBeenCalledWith("marketing");
  expect(writes[0].values).toMatchObject({ status: "queued", state: { seedVersion: 2, sources: [{ platform: "hacker_news" }] } });
  expect(mocks.assess).not.toHaveBeenCalled(); expect(mocks.search).not.toHaveBeenCalled();
});
it("does not query a disabled native source even when an earlier plan includes its topic", async () => {
  const job = makeJob(); delete job.state.seedVersion;
  job.state.queryPlan = { status: "ready", terms: [], communityQuery: "marketing" };
  await processSignalDiscovery(database(job).admin);
  expect(mocks.native).not.toHaveBeenCalled();
});
it("restores the last persisted state after an analysis failure and backs off",async()=>{
  mocks.assess.mockRejectedValue(new Error("analysis_http_503"));const job=makeJob();const {admin,writes}=database(job);
  await processSignalDiscovery(admin);
  expect(writes[0].values).toMatchObject({status:"queued",retry_count:1,error_code:"analysis_http_503",state:{readCount:1}});
  expect(Date.parse(String(writes[0].values.due_at))).toBeGreaterThan(Date.now()+50000);
});
it("ends the job at budget exhaustion without inventing a recommendation",async()=>{
  mocks.assess.mockRejectedValue(new Error("budget_exhausted"));const {admin,writes}=database(makeJob());await processSignalDiscovery(admin);
  expect(writes[0].values).toMatchObject({status:"partial",error_code:"budget_exhausted",state:{recommended:0}});
});
it("cancels outdated profile work before issuing any model request",async()=>{
  mocks.context.mockResolvedValue({profileVersion:"v2"});const {admin,writes}=database(makeJob());await processSignalDiscovery(admin);
  expect(writes[0].values).toMatchObject({status:"cancelled",error_code:"profile_changed"});expect(mocks.search).not.toHaveBeenCalled();expect(mocks.assess).not.toHaveBeenCalled();
});

it("honors an optional account allowlist and opens access when it is empty",()=>{
  vi.stubEnv("SIGNAL_DISCOVERY_USER_IDS","pilot1, pilot2");
  expect(discoveryUserAllowed("pilot1")).toBe(true);expect(discoveryUserAllowed("other-user")).toBe(false);
  vi.stubEnv("SIGNAL_DISCOVERY_USER_IDS", "");
  expect(discoveryUserAllowed("other-user")).toBe(true);
});

function creditsAdmin(){
  const tables:Record<string,unknown>={profiles:{plan:"agent"},subscriptions:[],signal_discovery_jobs:null};
  const admin={from:vi.fn((table:string)=>{
    const row=()=>structuredClone(tables[table]??null);
    const chain:Record<string,unknown>={};
    for(const method of ["select","eq","in","order","limit","or","gte","is"])chain[method]=vi.fn(()=>chain);
    for(const method of ["update","upsert","insert"])chain[method]=vi.fn((values:Record<string,unknown>)=>{tables[table]=values;return chain;});
    chain.delete=vi.fn(()=>chain);
    chain.maybeSingle=async()=>({data:row(),error:null});chain.single=async()=>({data:row(),error:null});
    chain.then=(fn:(value:unknown)=>unknown)=>Promise.resolve(row()).then(fn);
    return chain;
  })};
  return {admin:admin as never,tables};
}
it("refuses to queue a run the user's Credits cannot start",async()=>{
  mocks.availableCredits.mockResolvedValue(1);
  const {admin,tables}=creditsAdmin();
  await expect(enqueueSignalDiscovery(admin,"user1")).resolves.toBeNull();
  expect(tables.signal_discovery_jobs).toBeNull();expect(mocks.context).not.toHaveBeenCalled();
});
it("surfaces the Credits state alongside the latest job so the panel can price a run",async()=>{
  mocks.availableCredits.mockResolvedValue(42);
  const status=await loadSignalDiscoveryStatus(creditsAdmin().admin,"user1");
  expect(status).toMatchObject({status:"not_started",insufficientCredits:false,userDisabled:false,
    credits:{available:42,searchCost:1,analysisCost:2,estimatedRunCost:32}});
  mocks.availableCredits.mockResolvedValue(2);
  const broke=await loadSignalDiscoveryStatus(creditsAdmin().admin,"user1");
  expect(broke.insufficientCredits).toBe(true);
});
it("ends the run as insufficient_credits without refunding when the balance denies a call",async()=>{
  const job=makeJob();job.state.queryPlan={status:"pending",terms:[]};
  mocks.plan.mockRejectedValue(new Error("insufficient_credits"));
  const {admin,writes}=database(job);
  await processSignalDiscovery(admin);
  expect(writes[0].values).toMatchObject({status:"partial",error_code:"insufficient_credits"});
  expect(mocks.refundCredits).not.toHaveBeenCalled();
});
it("refunds the charged Credits when a step fails for a non-billing reason",async()=>{
  mocks.assess.mockImplementation(async(_c,_p,_provider,reserve:()=>Promise<boolean>)=>{ await reserve(); throw new Error("analysis_http_503"); });
  const {admin,writes}=database(makeJob());
  await processSignalDiscovery(admin);
  expect(mocks.refundCredits).toHaveBeenCalledWith("user1",2,"refund",{jobId:"job1",reason:"analysis_http_503"});
  expect(writes[0].values).toMatchObject({status:"queued",retry_count:1,error_code:"analysis_http_503"});
});

it("removes only the matching unreviewed demand projection when an article becomes content", async () => {
  mocks.assess.mockResolvedValue({ kind: "content", contentKind: "tutorial", demandStatus: "resolved", relevant: true, matchScore: 80,
    fact: excerpt, excerpt, whyYou: "The tutorial is relevant to this team's content workflow.", whyNow: "A recent tutorial.", action: "Consider a content piece evaluating the described approach." });
  const { admin, writes, calls } = database(makeJob());
  await processSignalDiscovery(admin);
  expect(writes.find(w => w.table === "topic_opportunities")?.values.match_dimensions).toMatchObject({ signalKind: "content" });
  const projectionCalls = calls.filter(call => call.table === "public_demand_signals");
  expect(projectionCalls).toEqual([
    {table:"public_demand_signals",method:"delete",args:[]},
    {table:"public_demand_signals",method:"eq",args:["user_id","user1"]},
    {table:"public_demand_signals",method:"eq",args:["source","business-discovery"]},
    {table:"public_demand_signals",method:"eq",args:["source_item_id","opp1"]},
    {table:"public_demand_signals",method:"eq",args:["status","new"]},
    {table:"public_demand_signals",method:"is",args:["reviewed_at",null]}
  ]);
  expect(writes.find(w => w.table === "signal_discovery_jobs")?.values.state).toMatchObject({recommended:1});
});
