// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { assessCandidate, evidenceFragments, planDiscoveryQueries } from "@/lib/signals/model";
import { assessmentFailure, buildDiscoveryQueries, candidateRecallScore, nextSignalCandidate, countRecommendedOpportunities, verifiedAssessment, type SignalCandidate } from "@/lib/signals/contracts";
import type { LLMProvider } from "@/lib/llm-providers";
import { signalSourceText } from "@/lib/signals/evidence";
const provider: LLMProvider = { name: "test", apiKey: "test", apiBase: "https://example.com/v1", costClass: "paid", jsonMode: "none", models: { haiku: "test", sonnet: "test", opus: "test" } };
const source: SignalCandidate = { url: "https://example.com/post", title: "Content approval request", snippet: "", text: "A small team needs an approval workflow before scheduling social posts. ".repeat(10), sourceLabel: "Community", platform: "public_web", publishedAt: new Date().toISOString(), evidenceLevel: "direct", status: "pending" };
const assessment = { contentKind: "question", demandStatus: "unresolved", kind: "demand", relevant: true, matchScore: 80, fact: "The source describes a concrete approval problem.", evidenceIndex: 1, whyYou: "This directly matches the team's content approval product.", whyNow: "The request is recent.", action: "Evaluate whether the approval workflow can solve the expressed problem." };
function modelResponse(raw: unknown) {
  const fetchMock = vi.fn(async (_url?: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(raw) } }] })));
  vi.stubGlobal("fetch", fetchMock); return fetchMock;
}
afterEach(() => vi.unstubAllGlobals());
it("selects literal source evidence by index instead of trusting model-written quotations", async () => {
  const fetchMock = modelResponse({ ...assessment, excerpt: "An invented quotation from the model." });
  const reserve = vi.fn(async () => true);
  const raw = await assessCandidate(source, { businessText: "content approval" }, provider, reserve);
  const result = verifiedAssessment(raw, source);
  expect(result?.excerpt).toBe(evidenceFragments(source.text)[1]);
  expect(source.text).toContain(result!.excerpt);
  expect(reserve).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("rejects invalid evidence references and does not invent a replacement excerpt", async () => {
  modelResponse({ ...assessment, evidenceIndex: 200, excerpt: source.text.slice(0, 50) });
  expect(verifiedAssessment(await assessCandidate(source, {}, provider, async () => true), source)).toBeNull();
});
it("keeps malformed output, quote mismatch and stale evidence distinguishable", () => {
  expect(assessmentFailure({}, source)).toContain("字段");
  const raw = { ...assessment, excerpt: "A fabricated claim that is not in the source." };
  expect(assessmentFailure(raw, source)).toContain("不一致");
  expect(assessmentFailure({ ...raw, excerpt: source.text.slice(0, 100) }, { ...source, publishedAt: "2020-01-01T00:00:00Z" })).toContain("30 天");
});
it("plans compact bilingual queries while retaining the allowed platforms, domains and intents", async () => {
  const queries = buildDiscoveryQueries({ businessText: "创作者内容审批" }, 0, new Set(["xiaohongshu", "reddit"]));
  modelResponse({ queries: [{ platform: "reddit", query: "social content approval workflow problems" }, { platform: "xiaohongshu", query: "创作者 内容审批 协作 困难" }], terms: ["内容审批", "content approval"] });
  const result = await planDiscoveryQueries({}, queries, provider, async () => true);
  expect(result.queries.map(({ query: _query, ...rest }) => rest)).toEqual(queries.map(({ query: _query, ...rest }) => rest));
  expect(result.queries[1].query).toBe("social content approval workflow problems");
  modelResponse({ queries: [{ platform: "reddit", query: "social approval" }, { platform: "arbitrary", query: "other site" }], terms: ["approval"] });
  await expect(planDiscoveryQueries({}, queries, provider, async () => true)).rejects.toThrow("query_plan_invalid");
});
it("does not dispatch a planning request when the shared reservation is denied", async () => {
  const fetchMock = modelResponse({});
  await expect(planDiscoveryQueries({}, [], provider, async () => false)).rejects.toThrow("budget_exhausted");
  expect(fetchMock).not.toHaveBeenCalled();
});
it("ranks topic matches above unrelated broad trends, without changing semantic qualification", () => {
  const profile = { businessText: "产品设计和内容增长" }, terms = ["内容审批", "content approval"];
  expect(candidateRecallScore(source, profile, terms)).toBeGreaterThan(candidateRecallScore({ ...source, title: "AI power supply expansion" }, profile, terms));
});
it("counts one business opportunity when several sources corroborate the same event", () => {
  expect(countRecommendedOpportunities([{ ...source, status: "recommended", opportunityId: "one" }, { ...source, url: "https://example.com/other", status: "recommended", opportunityId: "one" }])).toBe(1);
});
it("spreads scarce original reads across publishers without automatically recommending another source", () => {
  const repeated = { ...source, title: "content approval", url: "https://example.com/third" };
  const alternative = { ...source, title: "An independent developer asks about marketing", snippet: "", url: "https://news.ycombinator.com/item?id=1" };
  expect(nextSignalCandidate([repeated, alternative], {}, ["content approval"])?.url).toBe(repeated.url);
  const candidates: SignalCandidate[] = [{ ...source, url: "https://www.example.com/first", status: "assessed" },
    { ...source, url: "https://example.com/second", status: "blocked" }, repeated, alternative];
  expect(nextSignalCandidate(candidates, {}, ["content approval"])?.url).toBe(alternative.url);
  expect(alternative.status).toBe("pending");
});
it("decodes numeric webpage entities before producing literal evidence fragments", () => {
  const text = signalSourceText("<p>有数据&#xff0c;有依据&#61;可信。I&#x27;m a developer.</p>&#x110000; &#xd800;");
  expect(text).toBe("有数据，有依据=可信。I'm a developer. &#x110000; &#xd800;");
  expect(evidenceFragments(text)[0]).toContain("有数据，有依据=可信");
});
it("keeps a solved tutorial as content while rejecting unaudited demand", async () => {
  modelResponse({ ...assessment, contentKind: "tutorial", demandStatus: "resolved" });
  const result = verifiedAssessment(await assessCandidate(source, {}, provider, async () => true), source);
  expect(result).toMatchObject({ kind: "content", contentKind: "tutorial", demandStatus: "resolved" });
  modelResponse({ ...assessment, contentKind: "other", demandStatus: "not_applicable" });
  const raw = await assessCandidate(source, {}, provider, async () => true);
  expect(verifiedAssessment(raw, source)).toBeNull();
  expect(assessmentFailure(raw, source)).toContain("公开求助");
});
it("requires summary numbers in the selected quote, not elsewhere in the article", () => {
  const quote = "The author discusses developer growth and explains the methodology.";
  const article = { ...source, text: `${quote} Elsewhere, the author reports 64% growth.` };
  const raw = { ...assessment, kind: "content", excerpt: quote, fact: "The author reports 64% growth." };
  expect(assessmentFailure(raw, article)).toContain("数字");
  const supportedQuote = "The author reports 64 percent growth among 1,200 surveyed participants.";
  expect(verifiedAssessment({ ...raw, excerpt: supportedQuote, fact: "作者称调查覆盖１２００人，增长为６４％。" },
    { ...source, text: supportedQuote })).not.toBeNull();
  expect(verifiedAssessment({ ...raw, excerpt: supportedQuote, fact: "The survey claims 164% growth." },
    { ...source, text: supportedQuote })).toBeNull();
});
it("explicitly requests Chinese explanations for Chinese profiles and preserves English quotations", async () => {
  const fetchMock = modelResponse(assessment);
  const profile = { businessText: "帮助独立开发者解决内容增长问题" };
  const raw = await assessCandidate(source, profile, provider, async () => true);
  const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
  expect(JSON.parse(request.messages[1].content).responseLanguage).toBe("zh");
  expect(assessmentFailure(raw, source)).toContain("中文");
  modelResponse({ ...assessment, fact: "原作者提出了团队内容审批流程的问题。", whyYou: "这个问题与业务画像中的内容协作流程相关。",
    whyNow: "这是近期发布的公开问题，可核对原文。", action: "建议评估现有产品能否满足文中的审批需求。" });
  const result = verifiedAssessment(await assessCandidate(source, profile, provider, async () => true), source);
  expect(result?.responseLanguage).toBe("zh");
  expect(result?.excerpt).toBe(evidenceFragments(source.text)[1]);
});
