// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({ context:vi.fn(), preferences:vi.fn(), read:vi.fn(), assess:vi.fn(), plan:vi.fn(), native:vi.fn(), search:vi.fn(), persist:vi.fn(), cluster:vi.fn(), ensureCredits:vi.fn(), availableCredits:vi.fn(), refundCredits:vi.fn() }));
const askJevMock=vi.hoisted(()=>vi.fn());
vi.mock("@/lib/jev",()=>({askJev:askJevMock}));
vi.mock("@/lib/trends/service",()=>({loadPersonalizationContext:mocks.context,loadNegativeFeedbackTerms:async()=>[],persistSignals:mocks.persist,clusterSignals:mocks.cluster}));
vi.mock("@/lib/trends/source-preferences",()=>({loadTrendSourcePreferences:mocks.preferences,isTrendSourceEnabled:()=>true}));
vi.mock("@/lib/payment/entitlements",()=>({getActiveSubscription:()=>null,resolveEffectivePlan:()=>"agent",getPlanFeatures:()=>({agentTools:true,proactiveMonitoring:true})}));
vi.mock("@/lib/payment/credits",()=>({ensurePlanCredits:mocks.ensureCredits,getAvailableCredits:mocks.availableCredits,refundCredits:mocks.refundCredits}));
vi.mock("@/lib/signals/evidence",()=>({readSignalCandidate:mocks.read}));
vi.mock("@/lib/signals/native-search",()=>({searchNativeHackerNews:mocks.native}));
vi.mock("@/lib/signals/model",()=>({discoveryProviders:()=>[{name:"test"}],assessCandidate:mocks.assess,planDiscoveryQueries:mocks.plan}));
vi.mock("@/lib/agent/web-search-evidence",()=>({searchPublicWebByQuery:mocks.search}));
import { processSignalDiscovery, type DiscoveryJob } from "@/lib/signals/service";
import {
  applyPrescreenVerdicts, buildPrescreenQuestions, nextSignalCandidate,
  PRESCREEN_QUESTION_STEMS, candidateSchema, type SignalCandidate
} from "@/lib/signals/contracts";

const excerpt="Our small team needs a reliable content approval workflow across multiple accounts.";
const pending=(index:number):SignalCandidate=>candidateSchema.parse({url:`https://example.com/p${index}`,title:`Candidate ${index}`,snippet:excerpt,sourceLabel:"公开网页",platform:"public_web",publishedAt:null,evidenceLevel:"indexed"});
const makeJob=():DiscoveryJob=>({ id:"job1",user_id:"user1",profile_version:"v1",lease_token:"lease1",status:"running",search_calls:0,analysis_calls:0,retry_count:0,updated_at:new Date().toISOString(),error_code:null,trigger_kind:"manual",state:{profile:{businessText:"content approval"},profileVersion:"v1",phase:"read",seedVersion:2,queries:[],queryIndex:0,readCount:0,recommended:0,sources:[],candidates:[pending(0),pending(1),pending(2),pending(3)]}});
function database(job:DiscoveryJob){
  const writes:Array<{table:string;values:Record<string,unknown>}>=[];
  const original=structuredClone(job.state);
  const admin={rpc:vi.fn((name:string)=>{const value={data:name==="reserve_signal_discovery_call"?true:structuredClone(job),error:null};
    return Object.assign(Promise.resolve(value),{maybeSingle:async()=>value});}),from:vi.fn((table:string)=>{
    let mutated = false;
    const result=()=>({data:table==="profiles"?{plan:"agent"}:table==="subscriptions"||table==="trend_signals"?[]:table==="trend_event_signals"?{event_id:"event1"}:table==="topic_opportunities"?(mutated?{id:"opp1"}:null):{id:"job1",state:original},error:null});
    const chain:Record<string,unknown>={};
    for(const method of ["select","eq","in","order","limit","or","gte","is"]) chain[method]=vi.fn(()=>chain);
    for(const method of ["update","upsert","insert"]) chain[method]=vi.fn((values:Record<string,unknown>)=>{mutated=true;writes.push({table,values});return chain;});
    chain.delete=vi.fn(()=>chain);
    chain.maybeSingle=async()=>result();chain.single=async()=>result();chain.then=(fn:(value:unknown)=>unknown)=>Promise.resolve(result()).then(fn);
    return chain;
  })};return {admin:admin as never,writes};
}
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("SIGNAL_DISCOVERY_ENABLED","true");mocks.context.mockResolvedValue({profileVersion:"v1"});mocks.preferences.mockResolvedValue(new Set(["public_web"]));mocks.ensureCredits.mockResolvedValue(undefined);mocks.availableCredits.mockResolvedValue(999);mocks.refundCredits.mockResolvedValue(undefined);mocks.read.mockImplementation(async c=>c);mocks.persist.mockResolvedValue({rows:[{id:"signal1"}]});mocks.cluster.mockResolvedValue(undefined);mocks.assess.mockResolvedValue({contentKind:"question",demandStatus:"unresolved",kind:"demand",relevant:true,matchScore:85,fact:excerpt,excerpt,whyYou:"This is directly related to the target customer's workflow.",whyNow:"A current original request.",action:"Evaluate the approval workflow against this specific problem."});});
afterEach(()=>vi.unstubAllEnvs());

function noulAnswer(probability:number,index:number){ return { [`clearly_irrelevant_${index}`]: { type:"noul", noul:probability }, [`kind_hint_${index}`]: { type:"choice", choice:"demand", probabilities:{}, confidence:null } }; }

describe("prescreen question layout and verdicts", () => {
  it("builds global-indexed questions with {i} replaced", () => {
    const questions = buildPrescreenQuestions(2);
    expect(Object.keys(questions)).toEqual([
      "clearly_irrelevant_0", "kind_hint_0", "clearly_irrelevant_1", "kind_hint_1"
    ]);
    expect(questions.clearly_irrelevant_1.instructions).not.toContain("{i}");
    expect(questions.clearly_irrelevant_1.instructions).toContain("item 1");
    expect(PRESCREEN_QUESTION_STEMS.kind_hint.type).toBe("choice");
  });
  it("rejects at the threshold and keeps below it", () => {
    const candidates = [pending(0), pending(1)];
    const rejected = applyPrescreenVerdicts(candidates, {
      ...noulAnswer(0.7, 0), ...noulAnswer(0.69, 1)
    });
    expect(rejected).toBe(1);
    expect(candidates[0].prescreen).toBe("rejected");
    expect(candidates[1].prescreen).toBe("kept");
    expect(candidates[1].reason).toBeUndefined();
  });
  it("keeps candidates without usable answers (fail-open)", () => {
    const candidates = [pending(0)];
    expect(applyPrescreenVerdicts(candidates, {})).toBe(0);
    expect(candidates[0].prescreen).toBe("kept");
  });
});

describe("prescreen step in processSignalDiscovery", () => {
  it("skips Jev entirely below the candidate floor", async () => {
    const job = makeJob(); job.state.candidates = job.state.candidates.slice(0, 2);
    await processSignalDiscovery(database(job).admin);
    expect(askJevMock).not.toHaveBeenCalled();
    expect(mocks.read).toHaveBeenCalledTimes(1);
  });
  it("fails open on a Jev rejection: no marks, no early return, read proceeds", async () => {
    askJevMock.mockRejectedValue(new Error("jev_disabled"));
    const { admin, writes } = database(makeJob());
    await processSignalDiscovery(admin);
    const state = writes.find(w => w.table === "signal_discovery_jobs")?.values.state as DiscoveryJob["state"];
    expect(state.candidates.every(c => !c.prescreen)).toBe(true);
    expect(state.prescreen).toBeUndefined();
    expect(mocks.read).toHaveBeenCalledTimes(1);
  });
  it("marks rejected candidates and persists the saved-credit summary in its own step", async () => {
    askJevMock.mockResolvedValue({ model: "jev-1.13.0",
      answers: { ...noulAnswer(0.9, 0), ...noulAnswer(0.1, 1), ...noulAnswer(0.95, 2), ...noulAnswer(0.2, 3) },
      usage: { inputTokens: 100, outputTokens: 0 } });
    const { admin, writes } = database(makeJob());
    const outcome = await processSignalDiscovery(admin);
    expect(outcome).toEqual({ claimed: 1, status: "queued" });
    const saved = writes.find(w => w.table === "signal_discovery_jobs")!.values;
    expect(saved.status).toBe("queued");
    const state = saved.state as DiscoveryJob["state"];
    expect(state.candidates.filter(c => c.prescreen === "rejected")).toHaveLength(2);
    expect(state.candidates.filter(c => c.prescreen === "kept")).toHaveLength(2);
    expect(state.candidates[0].reason).toContain("自动预筛");
    expect(state.prescreen).toEqual({ skipped: 2, savedCredits: 4 });
    expect(mocks.read).not.toHaveBeenCalled();
    const [askState] = askJevMock.mock.calls[0];
    expect(askState.items).toHaveLength(4);
    expect(askState.brand_context).toBe("content approval");
    expect(askState.note).toContain("full page has not been read");
  });
  it("excludes rejected candidates from the next read pick", () => {
    const candidates = [pending(0), pending(1), pending(2)];
    applyPrescreenVerdicts(candidates, { ...noulAnswer(0.9, 0), ...noulAnswer(0.1, 1), ...noulAnswer(0.2, 2) });
    for (let round = 0; round < 3; round += 1) {
      const next = nextSignalCandidate(candidates, { businessText: "content approval" });
      expect(next?.prescreen).not.toBe("rejected");
      if (!next) break;
      next.status = "assessed";
    }
    expect(candidates.filter(c => c.status === "assessed")).toHaveLength(2);
  });
  it("completes the run when every pending candidate was prescreen-rejected and queries are exhausted", async () => {
    const job = makeJob();
    applyPrescreenVerdicts(job.state.candidates, {
      ...noulAnswer(0.9, 0), ...noulAnswer(0.9, 1), ...noulAnswer(0.9, 2), ...noulAnswer(0.9, 3)
    });
    const { admin, writes } = database(job);
    const outcome = await processSignalDiscovery(admin);
    expect(outcome).toEqual({ claimed: 1, status: "completed" });
    expect(writes.find(w => w.table === "signal_discovery_jobs")!.values.status).toBe("completed");
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
