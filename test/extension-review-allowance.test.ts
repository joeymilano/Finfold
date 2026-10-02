import { afterEach, describe, expect, it, vi } from "vitest";
import { ensurePlanCredits } from "@/lib/payment/credits";
import { extensionReviewExpiry, isExtensionReviewUser } from "@/lib/payment/extension-review";
import { getExtensionEntitlement } from "@/lib/extension/service";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdminClient: () => ({ rpc }) }));
const id = "12345678-1234-1234-1234-123456789abc";
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); vi.clearAllMocks(); });
function configure() {
  vi.stubEnv("FINFOLD_EXTENSION_REVIEW_USER_ID", id);
  vi.stubEnv("FINFOLD_EXTENSION_REVIEW_EXPIRES_AT", "2026-10-01T00:00:00Z");
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-09T00:00:00Z"));
  rpc.mockResolvedValue({ error: null });
}
describe("one-time extension reviewer allowance", () => {
  it("is disabled without an exact server-side account ID", () => {
    vi.stubEnv("FINFOLD_EXTENSION_REVIEW_USER_ID", "");
    expect(isExtensionReviewUser(id)).toBe(false);
    expect(extensionReviewExpiry(id)).toBeNull();
  });
  it("uses one immutable 60-credit batch across retries, plans and months", async () => {
    configure();
    vi.setSystemTime(new Date("2026-08-31T00:00:00Z"));
    await ensurePlanCredits(id, "free");
    await ensurePlanCredits(id, "starter");
    vi.setSystemTime(new Date("2026-09-30T00:00:00Z"));
    await ensurePlanCredits(id, "free");
    for (const call of rpc.mock.calls) expect(call).toEqual(["grant_plan_credits", {
      p_user_id: id, p_credits: 60, p_period_key: "extension-store-review-v1", p_expires_at: "2026-10-01T00:00:00Z"
    }]);
    expect(rpc).toHaveBeenCalledTimes(3);
  });
  it("never restores monthly grants after expiry or malformed expiry", async () => {
    configure();
    vi.setSystemTime(new Date("2026-10-02T00:00:00Z"));
    await ensurePlanCredits(id, "starter");
    expect(extensionReviewExpiry(id)).toBeNull();
    vi.stubEnv("FINFOLD_EXTENSION_REVIEW_EXPIRES_AT", "invalid");
    await ensurePlanCredits(id, "free");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("does not change normal account monthly grants", async () => {
    configure();
    await ensurePlanCredits("other-user", "free");
    expect(rpc.mock.calls[0]?.[1].p_period_key).toBe("2026-09");
  });
  it("fails closed on a database grant error", async () => {
    configure();
    rpc.mockResolvedValue({ error: { message: "unavailable" } });
    await expect(ensurePlanCredits(id, "free")).rejects.toThrow("Review allowance could not be verified");
  });
  it("allows the review model chain only during the explicitly configured window", async () => {
    configure();
    rpc.mockImplementation(async (name: string) => ({ error: null, data: name === "get_available_credits" ? 60 : null }));
    expect(await getExtensionEntitlement(id)).toEqual({ plan: "free", available: 60, providerPolicy: "all" });
    vi.setSystemTime(new Date("2026-10-01T00:00:00Z"));
    expect((await getExtensionEntitlement(id)).providerPolicy).toBe("free_only");
  });
});
