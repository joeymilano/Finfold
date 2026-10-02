import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("anonymous generation boundary", () => {
  it("removes the public generation endpoint and every inline trial console", () => {
    expect(existsSync(join(process.cwd(), "app/api/trial/generate/route.ts"))).toBe(false);
    expect(existsSync(join(process.cwd(), "components/landing/TrialWidget.tsx"))).toBe(false);

    expect(source("components/landing/LandingPage.tsx")).not.toContain("TrialWidget");
    expect(source("components/tools/ToolPage.tsx")).not.toContain("TrialWidget");
    expect(source("app/share/[slug]/page.tsx")).not.toContain("TrialWidget");
  });

  it("keeps the workbench publicly previewable while replacing generation with login CTAs", () => {
    const layout = source("app/(dashboard)/layout.tsx");
    const workbench = source("components/workbench/DashboardWorkbench.tsx");
    const provider = source("components/workbench/WorkbenchProvider.tsx");

    expect(layout).toContain('pathname !== "/workbench"');
    expect(workbench).toContain('data-testid="generate-login-desktop"');
    expect(workbench).toContain('data-testid="generate-login-mobile"');
    expect(workbench).toContain("登录后免费生成");
    expect(workbench).not.toContain("TurnstileWidget");
    expect(provider).toContain("entitlement.authenticated &&");
    expect(provider).not.toContain("trialMode");
    expect(provider).not.toContain("turnstileToken");
  });

  it("advertises preview, not anonymous generation, across public entry points", () => {
    const landing = source("components/landing/LandingPage.tsx");
    const authForm = source("components/app-shell/AuthForm.tsx");
    const authSplit = source("components/app-shell/AuthSplit.tsx");

    expect(landing).not.toContain('id="try"');
    expect(landing).toContain('const APP_ENTRY_HREF = "/workbench?start=1"');
    expect(authForm).toContain('href="/workbench"');
    expect(authSplit).toContain('href={isFirstTask ? safeReturnTo : "/workbench"}');
  });
});
