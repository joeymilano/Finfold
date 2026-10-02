import { beforeEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/extension/v1/reply-drafts/route";

const mock = vi.hoisted(() => ({ auth: vi.fn(), run: vi.fn(), origin: vi.fn() }));
vi.mock("@/lib/extension/auth", () => ({ authenticateExtensionRequest: mock.auth }));
vi.mock("@/lib/extension/reply-service", () => ({ runReplyDraft: mock.run }));
vi.mock("@/lib/extension/cors", () => ({
  isAllowedExtensionOrigin: mock.origin,
  isAllowedExtensionRequestOrigin: mock.origin,
  extensionPreflight: () => new Response(null, { status: 204 }),
  extensionJson: (_: unknown, body: unknown, init?: ResponseInit) => Response.json(body, init)
}));
const id = "11111111-1111-4111-8111-111111111111";
const request = (body: unknown = { requestId: "22222222-2222-4222-8222-222222222222", platform: "linkedin", comment: "Thanks!" }) => new Request("https://www.finfold.app/api/extension/v1/reply-drafts", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("FINFOLD_EXTENSION_AUTH_ENABLED", "true"); vi.stubEnv("FINFOLD_EXTENSION_PAID_ACTIONS_ENABLED", "true");
  vi.stubEnv("FINFOLD_EXTENSION_REPLY_DRAFTS_ENABLED", "true"); vi.stubEnv("FINFOLD_EXTENSION_REPLY_PILOT_USER_IDS", id);
  mock.auth.mockResolvedValue({ userId: id, scope: ["extension:generate"] }); mock.origin.mockReturnValue(true);
  mock.run.mockResolvedValue({ result: { status: "draft", body: "Thanks!", factsToCheck: [] }, cost: 3 });
});
it("rejects untrusted extension origins before accessing user data", async () => {
  mock.origin.mockReturnValue(false); expect((await POST(request())).status).toBe(403); expect(mock.auth).not.toHaveBeenCalled();
});
it("requires a valid generation session", async () => {
  mock.auth.mockResolvedValue(null); expect((await POST(request())).status).toBe(401); expect(mock.run).not.toHaveBeenCalled();
});
it("does not accept a client-supplied pilot identity", async () => {
  mock.auth.mockResolvedValue({ userId: "other", scope: ["extension:generate"] });
  expect((await POST(request())).status).toBe(403); expect(mock.run).not.toHaveBeenCalled();
});
it("closes the independent reply gate", async () => {
  vi.stubEnv("FINFOLD_EXTENSION_REPLY_DRAFTS_ENABLED", "false"); expect((await POST(request())).status).toBe(403);
});
it("uses only the authenticated user's ID", async () => {
  expect((await POST(request())).status).toBe(200); expect(mock.run.mock.calls[0][0]).toBe(id);
});
it("rejects blank comments before generation", async () => {
  expect((await POST(request({ comment: "" }))).status).toBe(400); expect(mock.run).not.toHaveBeenCalled();
});
it("returns a recoverable status after uncertain settlement", async () => {
  mock.run.mockRejectedValue(new Error("REQUEST_IN_PROGRESS")); const response = await POST(request());
  expect(response.status).toBe(409); expect((await response.json()).error.code).toBe("REQUEST_IN_PROGRESS");
});
