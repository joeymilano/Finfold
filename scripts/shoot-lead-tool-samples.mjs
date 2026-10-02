/**
 * Shoots store assets for the three seeded lead tools:
 *  - per tool: mobile (375px) intro + result screenshots
 *  - one 1280x720 comparison hero (plain intro text vs live tool)
 * Output: apps/workbuddy-skill/store-assets/
 */
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const OUT = new URL("../apps/workbuddy-skill/store-assets/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const TOOLS = [
  { slug: "1be3b2556d", name: "finfold-content-ops" },
  { slug: "378c99f1d3", name: "portfolio-review" },
  { slug: "295054ff59", name: "product-intro-clarity" }
];

const PLAIN_INTRO_LINES = [
  "我们是一支专注于数字化转型解决方案的团队，",
  "致力于通过创新的技术手段和卓越的服务理念，",
  "为企业客户提供全链路、多维度、一体化的",
  "产品与服务体系，赋能客户实现降本增效",
  "与可持续增长，携手共创美好未来。"
];

async function shootTool(page, slug, name) {
  await page.goto(`https://www.finfold.app/t/${slug}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${name}-intro.png`, fullPage: true });

  await page.getByRole("button", { name: "开始", exact: true }).click();
  for (let step = 0; step < 5; step += 1) {
    await page.locator("section button").first().click();
    await page.waitForTimeout(220);
  }
  await page.getByText("你的结果").waitFor({ timeout: 5000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}-result.png`, fullPage: true });
}

async function main() {
  const browser = await chromium.launch();
  const heroOnly = process.env.HERO_ONLY === "1";
  if (!heroOnly) {
    const mobile = await browser.newContext({
      viewport: { width: 375, height: 812 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true
    });
    const page = await mobile.newPage();

    for (const tool of TOOLS) {
      await shootTool(page, tool.slug, tool.name);
      console.log(`shot: ${tool.name} (intro + result)`);
    }
    await mobile.close();
  }

  // Hero comparison: left = the wordy intro nobody reads, right = the real tool.
  const resultShot = readFileSync(`${OUT}/finfold-content-ops-result.png`).toString("base64");
  const desktop = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  await desktop.setContent(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { width: 1280px; height: 720px; font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; background: #fafaf9; display: flex; align-items: center; justify-content: center; gap: 56px; }
    .col { display: flex; flex-direction: column; align-items: center; gap: 18px; }
    .label { font-size: 15px; font-weight: 700; color: #78716c; letter-spacing: .06em; }
    .plain { width: 420px; background: #fff; border: 1px solid #e7e5e4; border-radius: 16px; padding: 28px; font-size: 16px; line-height: 2; color: #57534e; }
    .phone { width: 300px; height: 560px; border: 10px solid #1c1917; border-radius: 36px; overflow: hidden; background: #fff; }
    .phone img { display: block; width: 280px; }
    .note { font-size: 12px; color: #a8a29e; }
  </style></head><body>
    <div class="col">
      <span class="label">一段普通的产品介绍</span>
      <div class="plain">${PLAIN_INTRO_LINES.join("<br/>")}</div>
      <span class="note">客户看完：所以你们是干嘛的？</span>
    </div>
    <div class="col">
      <span class="label">一个客户真的会做完的小工具</span>
      <div class="phone"><img src="data:image/png;base64,${resultShot}" /></div>
      <span class="note">来访者：两分钟，拿到自己的行动清单（演示数据）</span>
    </div>
  </body></html>`, { waitUntil: "networkidle" });
  await desktop.waitForTimeout(500);
  await desktop.screenshot({ path: `${OUT}/store-hero-comparison.png` });
  console.log("shot: store-hero-comparison.png");

  await browser.close();
  console.log(`\nAll assets in ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
