// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({auth:vi.fn(),admin:vi.fn(),enabled:vi.fn(),can:vi.fn(),enqueue:vi.fn(),status:vi.fn(),credits:vi.fn(),prefs:vi.fn()}));
vi.mock("@/lib/supabase",()=>({getCurrentUserId:m.auth,createSupabaseAdminClient:m.admin}));
vi.mock("@/lib/signals/service",()=>({discoveryEnabled:m.enabled,canDiscover:m.can,enqueueSignalDiscovery:m.enqueue,loadSignalDiscoveryStatus:m.status,loadDiscoveryCredits:m.credits}));
vi.mock("@/lib/signals/preferences",()=>({loadSignalDiscoveryPreferences:m.prefs}));
import { GET,POST } from "@/app/api/operations/signals/route";
beforeEach(()=>{vi.clearAllMocks();m.auth.mockResolvedValue("signed-in-user");m.admin.mockReturnValue({});m.enabled.mockReturnValue(true);m.can.mockResolvedValue(true);m.enqueue.mockResolvedValue("job1");m.status.mockResolvedValue({status:"queued",id:"job1"});m.credits.mockResolvedValue({available:999,minimumRunCost:3});m.prefs.mockResolvedValue({enabled:true});});
it("returns only the authenticated user's progress with no caching",async()=>{
  const r=await GET();expect(r.status).toBe(200);expect(r.headers.get("cache-control")).toBe("no-store");expect(m.status).toHaveBeenCalledWith({},"signed-in-user");
});
it("requires authentication before creating or reading jobs",async()=>{
  m.auth.mockRejectedValue(new Error("Unauthorized"));expect((await POST()).status).toBe(401);expect((await GET()).status).toBe(401);expect(m.enqueue).not.toHaveBeenCalled();expect(m.status).not.toHaveBeenCalled();
});
it("enqueues permitted work but never calls the collector synchronously",async()=>{
  expect((await POST()).status).toBe(202);expect(m.enqueue).toHaveBeenCalledWith({},"signed-in-user");
});
it("preserves plan and profile gating",async()=>{
  m.can.mockResolvedValue(false);expect((await POST()).status).toBe(403);expect(m.enqueue).not.toHaveBeenCalled();
  m.can.mockResolvedValue(true);m.enqueue.mockResolvedValue(null);expect((await POST()).status).toBe(422);
});
it("refuses a doomed run with 402 when the user's Credits cannot start it",async()=>{
  m.credits.mockResolvedValue({available:1,minimumRunCost:3});
  const r=await POST();expect(r.status).toBe(402);expect(m.enqueue).not.toHaveBeenCalled();expect(await r.json()).toMatchObject({code:"INSUFFICIENT_CREDITS",available:1,needed:3});
});
it("refuses a run with 403 when the user turned signal discovery off",async()=>{
  m.prefs.mockResolvedValue({enabled:false});
  const r=await POST();expect(r.status).toBe(403);expect(m.enqueue).not.toHaveBeenCalled();
});
it("reports storage failure instead of returning successful empty results",async()=>{
  m.status.mockRejectedValue(new Error("private database detail"));const r=await GET();expect(r.status).toBe(503);expect(await r.text()).not.toContain("private database detail");
});
