import { describe, expect, it } from "vitest";
import {
  buildLogRecord,
  estimateModelCostUsd,
  resolveRequestId
} from "@/lib/observability";

describe("observability primitives", () => {
  it("preserves valid correlation ids and replaces malformed values", () => {
    expect(resolveRequestId("request_12345678")).toBe("request_12345678");
    expect(resolveRequestId("bad id with spaces")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f-]{27}$/i
    );
  });

  it("builds flat structured records with the full generation chain", () => {
    const record = buildLogRecord(
      "info",
      "generation_completed",
      {
        requestId: "request-1",
        traceId: "trace-1",
        generationRunId: "run-1",
        userId: "user-1"
      },
      { provider: "primary", latency_ms: 321, omitted: undefined }
    );

    expect(record).toMatchObject({
      level: "info",
      event: "generation_completed",
      service: "finfold",
      request_id: "request-1",
      trace_id: "trace-1",
      generation_run_id: "run-1",
      user_id: "user-1",
      provider: "primary",
      latency_ms: 321
    });
    expect(record).not.toHaveProperty("omitted");
  });

  it("estimates model cost only from explicit deployment pricing", () => {
    const usage = { inputTokens: 1_000_000, outputTokens: 500_000, totalTokens: 1_500_000 };
    const pricing = JSON.stringify({
      "primary:model-a": { input: 0.2, output: 0.8 }
    });

    expect(estimateModelCostUsd("primary", "model-a", usage, pricing)).toBe(0.6);
    expect(estimateModelCostUsd("primary", "unknown", usage, pricing)).toBeNull();
    expect(estimateModelCostUsd("primary", "model-a", usage, "not-json")).toBeNull();
  });
});
