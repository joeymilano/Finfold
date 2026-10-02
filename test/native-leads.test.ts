import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ingestNativeLeadCandidate,
  listNativeLeadSubmissions,
  NativeLeadRequestError,
  readNativeLeadSubmission
} from "@/lib/native-leads";
import { encryptSecret } from "@/lib/secret-encryption";

const encryptionKey = Buffer.alloc(32, 12).toString("base64");

beforeEach(() => {
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", encryptionKey);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("native lead capture", () => {
  it("parses a bounded, consented submission", async () => {
    const request = submissionRequest();
    await expect(readNativeLeadSubmission(request)).resolves.toMatchObject({
      submissionId: "5f2841ce-fad7-426b-93e2-dfffd90bc903",
      workEmail: "founder@example.com",
      company: "Example Studio",
      consent: true,
      locale: "en"
    });
  });

  it("rejects oversized bodies before parsing", async () => {
    const request = new Request("https://www.finfold.app/api/leads/abc123def456", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": String(20 * 1024) },
      body: "{}"
    });
    await expect(readNativeLeadSubmission(request)).rejects.toMatchObject({
      status: 413,
      code: "request_too_large"
    } satisfies Partial<NativeLeadRequestError>);
  });

  it("encrypts PII and sends only hashes plus ciphertext to the database", async () => {
    const rpc = vi.fn(async (_name: string, _params: Record<string, unknown>) => ({
      data: {
        accepted: true,
        replayed: false,
        leadSubmissionId: "014abf06-d42c-40d1-adca-e72aa686d333"
      },
      error: null
    }));
    const admin = { rpc };
    const submission = await readNativeLeadSubmission(submissionRequest());

    await ingestNativeLeadCandidate(admin as never, {
      trackingCode: "abc123def456",
      submission,
      occurredAt: "2026-08-26T12:00:00.000Z"
    });

    expect(rpc).toHaveBeenCalledWith("ingest_native_lead_candidate", expect.objectContaining({
      p_tracking_code: "abc123def456",
      p_submission_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      p_payload_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      p_email_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      p_encrypted_work_email: expect.stringMatching(/^enc:v1:/),
      p_encrypted_company: expect.stringMatching(/^enc:v1:/),
      p_encrypted_need: expect.stringMatching(/^enc:v1:/),
      p_consent_version: "privacy-2026-08-26",
      p_occurred_at: "2026-08-26T12:00:00.000Z"
    }));
    const values = rpc.mock.calls[0][1];
    expect(JSON.stringify(values)).not.toContain("founder@example.com");
    expect(JSON.stringify(values)).not.toContain("Example Studio");
  });

  it("decrypts owner-visible submissions only after tenant filters are applied", async () => {
    const encrypted = await Promise.all([
      encryptSecret("founder@example.com"),
      encryptSecret("Example Studio"),
      encryptSecret("We need a reliable demand-to-revenue loop.")
    ]);
    const query = createLeadQuery([{
      id: "014abf06-d42c-40d1-adca-e72aa686d333",
      encrypted_work_email: encrypted[0],
      encrypted_company: encrypted[1],
      encrypted_need: encrypted[2],
      locale: "en",
      status: "new",
      consented_at: "2026-08-26T12:00:00.000Z",
      reviewed_at: null,
      created_at: "2026-08-26T12:00:00.000Z"
    }]);
    const admin = { from: vi.fn(() => query) };

    await expect(listNativeLeadSubmissions(admin as never, {
      userId: "owner-a",
      missionId: "50b2ab5b-bc5d-42aa-8403-7e0192415cff"
    })).resolves.toEqual([expect.objectContaining({
      workEmail: "founder@example.com",
      company: "Example Studio",
      status: "new"
    })]);
    expect(query.eq).toHaveBeenNthCalledWith(1, "mission_owner_user_id", "owner-a");
    expect(query.eq).toHaveBeenNthCalledWith(2, "mission_id", "50b2ab5b-bc5d-42aa-8403-7e0192415cff");
  });
});

function submissionRequest() {
  return new Request("https://www.finfold.app/api/leads/abc123def456", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      submissionId: "5f2841ce-fad7-426b-93e2-dfffd90bc903",
      workEmail: "Founder@Example.com",
      company: "Example Studio",
      need: "We need a reliable demand-to-revenue loop.",
      consent: true,
      locale: "en",
      turnstileToken: "verified-token"
    })
  });
}

function createLeadQuery(rows: Array<Record<string, unknown>>) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(async () => ({ data: rows, error: null }))
  };
  return query;
}
