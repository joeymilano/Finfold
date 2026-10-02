import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dashboardShell = readFileSync(
  join(process.cwd(), "components/app-shell/DashboardShell.tsx"),
  "utf8"
);
const mobileTabBar = readFileSync(
  join(process.cwd(), "components/app-shell/MobileTabBar.tsx"),
  "utf8"
);
const dashboardPage = readFileSync(join(process.cwd(), "app/(dashboard)/dashboard/page.tsx"), "utf8");
const legacyAgentPage = readFileSync(join(process.cwd(), "app/(dashboard)/agents/page.tsx"), "utf8");
const legacyResearchPage = readFileSync(join(process.cwd(), "app/(dashboard)/operations/research/page.tsx"), "utf8");

describe("dashboard sidebar layout", () => {
  it("keeps the commercial path primary and moves specialist tools behind Advanced", () => {
    const navDefinitions = dashboardShell.slice(
      dashboardShell.indexOf("const primaryNavItemDefs"),
      dashboardShell.indexOf("export function DashboardShell")
    );

    expect(navDefinitions).not.toContain('href: "/invite"');
    expect(navDefinitions).toContain('zh: "Finfold智能体"');
    expect(navDefinitions.indexOf('href: "/dashboard"')).toBeLessThan(navDefinitions.indexOf('href: "/operations"'));
    expect(navDefinitions).toContain('zh: "增长任务"');
    expect(navDefinitions).toContain('href: "/operations"');
    expect(navDefinitions).not.toContain('href: "/operations/missions"');
    expect(navDefinitions).toContain('zh: "内容库"');
    expect(navDefinitions).toContain("const advancedNavItemDefs");
    // 小红书陪跑入口收敛到运营板块页签，高级工具分组不再重复列出。
    expect(navDefinitions).not.toContain('href: "/operations/xiaohongshu"');
    expect(navDefinitions).not.toContain('href: "/agents"');
    expect(navDefinitions).not.toContain('href: "/operations/research"');
    expect(dashboardShell).toContain("高级工具");
    expect(dashboardShell).toContain("grid min-h-0 flex-1 content-start");
    expect(dashboardShell).not.toContain('data-testid="sidebar-invite-cta"');
  });

  it("keeps gated operations tabs consistent across every section page", () => {
    // 受控页签（增长闭环/X 流水线）的可见性只能在服务端计算；任何运营板块
    // 页面渲染 OperationsSectionNav 时都必须传齐两个开关，否则进入该页后
    // 页签会凭空消失（机会雷达页曾因此从 6 个掉到 4 个）。
    const operationsDir = join(process.cwd(), "app/(dashboard)/operations");
    const pages = readdirSync(operationsDir, { recursive: true })
      .map((entry) => String(entry))
      .filter((entry) => entry.endsWith("page.tsx"));
    expect(pages.length).toBeGreaterThan(0);
    for (const page of pages) {
      const source = readFileSync(join(operationsDir, page), "utf8");
      if (!source.includes("OperationsSectionNav")) continue;
      expect(source, `${page} renders OperationsSectionNav without the gated flags`).toContain("growthLoop");
      expect(source, `${page} renders OperationsSectionNav without the gated flags`).toContain("xPipeline");
    }
  });

  it("anchors the desktop sidebar while the main workspace owns vertical scrolling", () => {
    expect(dashboardShell).toContain("lg:h-screen lg:min-h-0 lg:overflow-hidden");
    expect(dashboardShell).toContain("lg:grid lg:h-screen");
    expect(dashboardShell).toContain("lg:flex lg:h-full lg:min-h-0 lg:overflow-hidden");
    expect(dashboardShell).toContain("lg:h-screen lg:overflow-y-auto lg:overscroll-contain");
    expect(dashboardShell).not.toContain("lg:sticky lg:top-0");
  });

  it("makes Agent the default workspace and removes duplicate mobile/research entries", () => {
    expect(dashboardPage).toContain("<AgentAutomationCenter");
    expect(legacyAgentPage).toContain("redirect(`/dashboard");
    expect(legacyResearchPage).toContain('redirect("/dashboard?intent=research")');
    expect(mobileTabBar).toContain('href: "/dashboard", zh: "智能体"');
    expect(mobileTabBar).not.toContain('href: "/agents"');
    expect(mobileTabBar).not.toContain('href: "/operations/research"');
    expect(mobileTabBar).not.toContain('href: "/operations/xiaohongshu"');
    expect(mobileTabBar).toContain('aria-haspopup="dialog"');
    expect(mobileTabBar).toContain('event.key === "Escape"');
  });
});
