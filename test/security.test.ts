import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AVATAR_MULTIPART_MAX_BYTES,
  IMAGE_MULTIPART_MAX_BYTES,
  MCP_JSON_MAX_BYTES,
  MEDIA_MULTIPART_MAX_BYTES
} from "@/lib/bounded-form-data";
import { applySecurityHeaders, buildContentSecurityPolicy, evaluateRequestSecurity } from "@/lib/security";

const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

afterEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
});

describe("request security", () => {
  it("allows same-origin API mutations", () => {
    const request = new Request("https://www.finfold.app/api/generate", {
      method: "POST",
      headers: { origin: "https://www.finfold.app", "content-length": "500" }
    });
    expect(evaluateRequestSecurity(request)).toEqual({ allowed: true });
  });

  it("treats localhost and 127.0.0.1 as equivalent only during local development", () => {
    const request = new Request("http://localhost:3000/api/entitlements/check", {
      method: "POST",
      headers: { origin: "http://127.0.0.1:3000" }
    });
    expect(evaluateRequestSecurity(request)).toEqual({ allowed: true });
  });

  it("blocks cross-site browser mutations", () => {
    const request = new Request("https://www.finfold.app/api/generate", {
      method: "POST",
      headers: { origin: "https://attacker.example" }
    });
    expect(evaluateRequestSecurity(request)).toMatchObject({ allowed: false, status: 403 });
  });

  it("leaves signed server-to-server routes to their signature checks", () => {
    const request = new Request("https://www.finfold.app/api/webhooks/creem", {
      method: "POST",
      headers: { origin: "https://api.creem.io" }
    });
    expect(evaluateRequestSecurity(request)).toEqual({ allowed: true });
  });

  it("allows the scheduled Agent patrol through to its bearer-secret check", () => {
    const request = new Request("https://www.finfold.app/api/agent/patrol", {
      method: "POST",
      headers: { origin: "https://workers.dev", authorization: "Bearer cron-secret" }
    });
    expect(evaluateRequestSecurity(request)).toEqual({ allowed: true });
  });

  it("allows remote MCP clients through to their Bearer-token check", () => {
    const request = new Request("https://www.finfold.app/api/mcp", {
      method: "POST",
      headers: { origin: "https://claude.ai", authorization: "Bearer ff_mcp_example" }
    });
    expect(evaluateRequestSecurity(request)).toEqual({ allowed: true });
  });

  it("applies bounded limits that match each upload route", () => {
    const oversized = String(2 * 1024 * 1024);
    const generate = new Request("https://www.finfold.app/api/generate", {
      method: "POST",
      headers: { "content-length": oversized }
    });
    expect(evaluateRequestSecurity(generate)).toMatchObject({ allowed: false, status: 413 });

    const uploadRoutes = [
      ["/api/media", MEDIA_MULTIPART_MAX_BYTES],
      ["/api/agent/attachments", MEDIA_MULTIPART_MAX_BYTES],
      ["/api/mcp", MCP_JSON_MAX_BYTES],
      ["/api/auth/avatar", AVATAR_MULTIPART_MAX_BYTES],
      ["/api/capture/image", IMAGE_MULTIPART_MAX_BYTES],
      ["/api/kits/kit-1/outputs/output-1/cover", IMAGE_MULTIPART_MAX_BYTES]
    ] as const;

    for (const [pathname, limit] of uploadRoutes) {
      const atLimit = new Request(`https://www.finfold.app${pathname}`, {
        method: "POST",
        headers: { "content-length": String(limit) }
      });
      const overLimit = new Request(`https://www.finfold.app${pathname}`, {
        method: "POST",
        headers: { "content-length": String(limit + 1) }
      });

      expect(evaluateRequestSecurity(atLimit), pathname).toEqual({ allowed: true });
      expect(evaluateRequestSecurity(overLimit), pathname).toMatchObject({
        allowed: false,
        status: 413
      });
    }
  });
});

describe("security headers", () => {
  it("sets browser hardening headers and a request id", () => {
    const headers = new Headers();
    applySecurityHeaders(headers, "request-123");
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("x-frame-options")).toBe("DENY");
    expect(headers.get("x-request-id")).toBe("request-123");
    expect(headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(headers.get("permissions-policy")).toContain("microphone=(self)");
  });

  it("allows Turnstile in the content security policy", () => {
    expect(buildContentSecurityPolicy()).toContain("https://challenges.cloudflare.com");
  });

  it("allows PostHog's regional asset endpoint used by landing analytics", () => {
    expect(buildContentSecurityPolicy()).toContain("https://us-assets.i.posthog.com");
    expect(buildContentSecurityPolicy()).toContain("https://eu-assets.i.posthog.com");
  });
});

describe("database RPC permissions", () => {
  it("keeps privileged SECURITY DEFINER functions backend-only", () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/057_server_only_rpc_permissions.sql"
      ),
      "utf8"
    );
    const privilegedFunctions = [
      "get_available_credits",
      "grant_plan_credits",
      "reserve_credits",
      "refund_credits",
      "grant_purchase_credits",
      "reserve_generation_credit",
      "release_generation_credit",
      "reserve_trial_generation",
      "redeem_activation_code",
      "increment_kit_share_view"
    ];

    for (const functionName of privilegedFunctions) {
      expect(migration).toContain(
        `REVOKE ALL ON FUNCTION public.${functionName}`
      );
    }
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("TO service_role");
  });
});

describe("product route isolation", () => {
  it("opens only the workbench preview while keeping generation and other dashboard routes authenticated", () => {
    const dashboardLayout = readFileSync(
      join(process.cwd(), "app/(dashboard)/layout.tsx"),
      "utf8"
    );
    const middleware = readFileSync(join(process.cwd(), "middleware.ts"), "utf8");
    const workbenchProvider = readFileSync(
      join(process.cwd(), "components/workbench/WorkbenchProvider.tsx"),
      "utf8"
    );
    const dashboardShell = readFileSync(
      join(process.cwd(), "components/app-shell/DashboardShell.tsx"),
      "utf8"
    );

    expect(dashboardLayout).toContain("createSupabaseServerClient");
    expect(dashboardLayout).toContain('pathname !== "/workbench"');
    expect(dashboardLayout).toContain('redirect(buildAuthHref("/login", requestTarget))');
    expect(dashboardLayout).toContain('requestHeaders.get("x-finfold-request-target")');
    expect(dashboardLayout).toContain("isLocalMockMode");
    expect(middleware).toContain('requestHeaders.set("x-finfold-pathname", request.nextUrl.pathname)');
    expect(workbenchProvider).toContain('if (!entitlement.authenticated || allowance.status !== "ready")');
    expect(workbenchProvider).toContain('fetch("/api/generate"');
    expect(workbenchProvider).not.toContain("/api/trial/generate");
    expect(workbenchProvider).not.toContain("showcaseKit");
    expect(workbenchProvider).not.toContain("showcaseOutputs");
    expect(dashboardShell).not.toContain(">Beta<");
  });
});

describe("external content isolation", () => {
  it("keeps scraped pages out of persistent agent execution", () => {
    const captureRoute = readFileSync(
      join(process.cwd(), "app/api/capture/route.ts"),
      "utf8"
    );
    const brandRoute = readFileSync(
      join(process.cwd(), "app/api/brand-brain/extract/route.ts"),
      "utf8"
    );
    const llm = readFileSync(join(process.cwd(), "lib/llm.ts"), "utf8");
    const safeUrl = readFileSync(join(process.cwd(), "lib/safe-url.ts"), "utf8");

    expect(captureRoute).toContain("sendUntrustedContentPrompt");
    expect(brandRoute).toContain("sendUntrustedContentPrompt");
    expect(llm).toContain("never falls back to a persistent Letta agent");
    expect(safeUrl).toContain('logInfo("external_fetch"');
    expect(safeUrl).toContain("audit_id");
    expect(safeUrl).not.toContain("pathname:");
    expect(safeUrl).not.toContain("searchParams:");
  });

  it("marks screenshot text as untrusted and bounds OCR output", () => {
    const imageCaptureRoute = readFileSync(
      join(process.cwd(), "app/api/capture/image/route.ts"),
      "utf8"
    );
    const imageCaptureParser = readFileSync(
      join(process.cwd(), "lib/image-capture-ocr.ts"),
      "utf8"
    );

    expect(imageCaptureRoute).toContain("不可信的数据");
    expect(imageCaptureParser).toContain("truncate(String(parsed.summary");
    expect(imageCaptureParser).toContain(", 80)");
    expect(imageCaptureParser).toContain(", 40)");
    expect(imageCaptureParser).toContain(".slice(0, 6)");
  });
});

describe("production observability", () => {
  it("enables Cloudflare logs and traces and propagates request ids", () => {
    const wrangler = readFileSync(join(process.cwd(), "wrangler.toml"), "utf8");
    const middleware = readFileSync(join(process.cwd(), "middleware.ts"), "utf8");
    const generateRoute = readFileSync(
      join(process.cwd(), "app/api/generate/route.ts"),
      "utf8"
    );

    expect(wrangler).toContain("[observability.logs]");
    expect(wrangler).toContain("invocation_logs = true");
    expect(wrangler).toContain("[observability.traces]");
    expect(middleware).toContain('requestHeaders.set("x-request-id", requestId)');
    expect(generateRoute).toContain('"generation_started"');
    expect(generateRoute).toContain('"generation_completed"');
    expect(generateRoute).toContain('"generation_failed"');
  });
});

describe("Cloudflare runtime support", () => {
  it("uses the supported OpenNext adapter instead of the archived Pages adapter", () => {
    const packageJson = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8")
    ) as {
      scripts: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const wrangler = readFileSync(join(process.cwd(), "wrangler.toml"), "utf8");
    const worker = readFileSync(join(process.cwd(), "worker.ts"), "utf8");
    const cloudflareBuild = readFileSync(
      join(process.cwd(), "scripts/build-cloudflare.mjs"),
      "utf8"
    );

    expect(packageJson.devDependencies["@opennextjs/cloudflare"]).toBeTruthy();
    expect(packageJson.devDependencies["@cloudflare/next-on-pages"]).toBeUndefined();
    expect(packageJson.scripts["build:cf"]).toBe("node scripts/build-cloudflare.mjs");
    expect(cloudflareBuild).toContain('["opennextjs-cloudflare", "build"]');
    expect(cloudflareBuild).toContain('"NEXT_PUBLIC_SUPABASE_URL"');
    expect(cloudflareBuild).toContain('"NEXT_PUBLIC_SUPABASE_ANON_KEY"');
    expect(wrangler).toContain('main = "worker.ts"');
    expect(worker).toContain('import openNextHandler from "./.open-next/worker.js"');
    expect(worker).toContain("fetch: fetchWithLocalizedDocumentLanguage");
    expect(worker).toContain("await openNextHandler.fetch(request, env, ctx)");
    expect(wrangler).toContain('directory = ".open-next/assets"');
    expect(wrangler).not.toContain("pages_build_output_dir");
  });
});
