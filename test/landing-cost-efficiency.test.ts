import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("landing cost-and-efficiency story", () => {
  const landing = readFileSync(join(process.cwd(), "components/landing/LandingPage.tsx"), "utf8");

  it("keeps the AI employee brand while leading with the employee loop and human confirmation", () => {
    expect(landing).toContain('kicker: "你的第一位 AI 增长运营员工"');
    expect(landing).toContain('titleA: "它盯住你的增长"');
    expect(landing).toContain('titleEm: "每一步都经你确认"');
    expect(landing).toContain('valuePoints: ["机会自动发现", "内容一次备好", "评论即时回复", "结果自动记录"]');
    expect(landing).toContain('secondaryCta: "算算我的运营成本"');
    expect(landing).toContain('href="#ops-cost"');
  });

  it("places the current-cost calculator before the existing account-health story", () => {
    expect(landing.indexOf("<CurrentOpsCostCalculator")).toBeGreaterThan(-1);
    expect(landing.indexOf("<CurrentOpsCostCalculator")).toBeLessThan(
      landing.indexOf("Account Health — evidence-led traffic doctor")
    );
  });

  it("does not add an unsupported saving rate or change the pricing source", () => {
    const calculator = readFileSync(join(process.cwd(), "components/landing/CurrentOpsCostCalculator.tsx"), "utf8");
    const pricing = readFileSync(join(process.cwd(), "lib/pricing.ts"), "utf8");

    expect(calculator).not.toMatch(/efficiencySavingRate|65%|roiMultiple/i);
    expect(calculator).not.toContain("根据你提供的当前工作方式计算");
    expect(calculator).not.toContain("。");
    expect(calculator).toContain("可由 Finfold 替代的机构 / 小红书陪跑月费");
    expect(calculator).toContain("Finfold 每个月预计帮你省下");
    expect(calculator).toContain("个人 / OPC 时间");
    expect(pricing).toContain('price: { cn: 79, global: 12 }');
    expect(pricing).toContain('price: { cn: 199, global: 29 }');
    expect(pricing).toContain('price: { cn: 999, global: 149 }');
    expect(pricing).toContain('price: { cn: 2_999, global: 399 }');
  });
});
