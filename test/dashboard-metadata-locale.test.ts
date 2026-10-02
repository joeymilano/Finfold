import { beforeEach, describe, expect, it, vi } from "vitest";

const headersMock = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({ headers: headersMock }));

import { generateMetadata as dashboardPageMetadata } from "@/app/(dashboard)/dashboard/page";
import { generateMetadata as overviewPageMetadata } from "@/app/(dashboard)/overview/page";
import { generateMetadata as operationsPageMetadata } from "@/app/(dashboard)/operations/page";
import { generateMetadata as xiaohongshuPageMetadata } from "@/app/(dashboard)/operations/xiaohongshu/page";
import { generateMetadata as accountHealthPageMetadata } from "@/app/(dashboard)/operations/account-health/page";
import { generateMetadata as opportunitiesPageMetadata } from "@/app/(dashboard)/operations/opportunities/page";
import { generateMetadata as opportunityDetailPageMetadata } from "@/app/(dashboard)/operations/opportunities/[id]/page";

const dashboardPages = [
  { name: "dashboard", build: dashboardPageMetadata, zhTitle: "Finfold智能体 | Finfold", enTitle: "Finfold Agent | Finfold" },
  { name: "overview", build: overviewPageMetadata, zhTitle: "增长总览 | Finfold", enTitle: "Growth Overview | Finfold" },
  { name: "operations", build: operationsPageMetadata, zhTitle: "运营项目 | Finfold", enTitle: "Operations Projects | Finfold" },
  { name: "operations/xiaohongshu", build: xiaohongshuPageMetadata, zhTitle: "小红书陪跑 | Finfold", enTitle: "Xiaohongshu Coaching | Finfold" },
  { name: "operations/account-health", build: accountHealthPageMetadata, zhTitle: "账号体检与限流诊断 | Finfold", enTitle: "Account Health & Throttle Diagnosis | Finfold" },
  { name: "operations/opportunities", build: opportunitiesPageMetadata, zhTitle: "机会雷达 | Finfold", enTitle: "Opportunity Radar | Finfold" },
  { name: "operations/opportunities/[id]", build: opportunityDetailPageMetadata, zhTitle: "机会详情 | Finfold", enTitle: "Opportunity Detail | Finfold" }
];

describe("dashboard page metadata locale", () => {
  beforeEach(() => {
    headersMock.mockReset();
  });

  it("keeps Chinese titles for the default locale", async () => {
    headersMock.mockResolvedValue(new Headers());
    for (const page of dashboardPages) {
      const metadata = await page.build();
      expect(metadata.title, page.name).toBe(page.zhTitle);
      expect(String(metadata.description), page.name).toMatch(/[一-鿿]/);
    }
  });

  it("switches to English titles for finfold-locale=en", async () => {
    headersMock.mockResolvedValue(new Headers({ cookie: "finfold-locale=en" }));
    for (const page of dashboardPages) {
      const metadata = await page.build();
      expect(metadata.title, page.name).toBe(page.enTitle);
      expect(String(metadata.description), page.name).not.toMatch(/[一-鿿]/);
    }
  });

  it("falls back to Accept-Language when no locale cookie is set", async () => {
    headersMock.mockResolvedValue(new Headers({ "accept-language": "en-US,en;q=0.9" }));
    const metadata = await dashboardPageMetadata();
    expect(metadata.title).toBe("Finfold Agent | Finfold");
  });
});
