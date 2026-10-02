import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarketingResourceLink } from "@/components/marketing/MarketingResourceLink";
import { MarketingLandingTracker } from "@/components/marketing/MarketingLandingTracker";
import { TrackedCtaLink } from "@/components/marketing/TrackedCtaLink";
import { PublicSiteHeader } from "@/components/marketing/PublicSiteHeader";
import { ToolsIndexView } from "@/components/tools/ToolsIndexView";
import { toolPages } from "@/lib/tool-pages";
import { captureEvent } from "@/lib/posthog";

vi.mock("next/navigation", () => ({ usePathname: () => "/tools" }));
vi.mock("@/lib/posthog", () => ({ captureEvent: vi.fn() }));
vi.mock("@/hooks/useLocale", () => ({ useLocale: () => "zh" }));
vi.mock("@/components/app-shell/FishLogo", () => ({ FishLogo: () => null }));
vi.mock("@/components/theme/LocaleToggle", () => ({ LocaleToggle: () => null }));
vi.mock("@/components/landing/SiteFooter", () => ({ SiteFooter: () => null }));
vi.mock("@/components/workbench/PlatformBrandIcon", () => ({ PlatformGlyph: () => null }));

beforeEach(() => {
  const values = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => Array.from(values.keys())[index] ?? null,
      get length() { return values.size; },
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value)
    }
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("public marketing growth entry", () => {
  it("captures a use-case landing view with its locale, slug, and path", async () => {
    window.history.replaceState({}, "", "/en/use-cases/ai-marketing-for-small-business");
    render(
      <MarketingLandingTracker
        contentType="use_case"
        contentSlug="ai-marketing-for-small-business"
        locale="en"
      />
    );

    await waitFor(() => expect(captureEvent).toHaveBeenCalledWith("landing_view", {
      contentType: "use_case",
      contentSlug: "ai-marketing-for-small-business",
      locale: "en",
      path: "/en/use-cases/ai-marketing-for-small-business"
    }));
  });

  it("renders every configured free generator exactly once on the tools index", () => {
    window.history.replaceState({}, "", "/tools");
    render(<ToolsIndexView locale="zh" />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "选一个平台，开始写。"
    );
    for (const tool of toolPages) {
      expect(screen.getAllByText(tool.titleZh)).toHaveLength(1);
      expect(screen.getByRole("link", { name: new RegExp(tool.titleZh) })).toHaveAttribute(
        "href",
        `/tools/${tool.slug}`
      );
    }
    expect(screen.queryByText("六个免费材料诊所")).not.toBeInTheDocument();
    expect(screen.queryByText("同一份材料，到了不同平台要回答不同的问题。")).not.toBeInTheDocument();
    expect(captureEvent).toHaveBeenCalledWith("tools_index_view", { locale: "zh" });
    expect(captureEvent).toHaveBeenCalledWith("landing_view", {
      contentType: "tools_index",
      locale: "zh",
      path: "/tools"
    });
  });

  it("keeps the mobile navigation out of the header layout and closes from the toggle or Escape", async () => {
    const user = userEvent.setup();
    render(<PublicSiteHeader locale="zh" localeHref="/en" />);

    const toggle = screen.getByRole("button", { name: "打开或关闭导航" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const mobileNav = screen.getByRole("navigation", { name: "移动端官网导航" });
    expect(mobileNav).toBeInTheDocument();
    expect(mobileNav).toHaveClass("!absolute");
    await waitFor(() => expect(screen.getAllByRole("link", { name: "产品" })[1]).toHaveFocus());

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("navigation", { name: "移动端官网导航" })).not.toBeInTheDocument();

    await user.click(toggle);
    await user.click(document.body);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("navigation", { name: "移动端官网导航" })).not.toBeInTheDocument();

    await user.click(toggle);
    await user.keyboard("{Escape}");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("navigation", { name: "移动端官网导航" })).not.toBeInTheDocument();
  });

  it("captures the public header signup CTA with the canonical conversion contract", async () => {
    const user = userEvent.setup();
    render(<PublicSiteHeader locale="zh" localeHref="/en" />);

    const signupLink = screen.getAllByRole("link", { name: "发现增长机会" })[0];
    signupLink.addEventListener("click", (event) => event.preventDefault());
    await user.click(signupLink);
    expect(captureEvent).toHaveBeenCalledWith("marketing_cta_clicked", {
      cta_id: "site_header_primary",
      source_type: "site_header",
      source_surface: "header",
      destination: "signup",
      locale: "zh",
      audience_state: "anonymous"
    });
  });

  it("captures a consistent resource click contract", async () => {
    const user = userEvent.setup();
    render(
      <MarketingResourceLink
        href="#twitter-thread-generator"
        resourceType="tool"
        slug="twitter-thread-generator"
        surface="landing"
        locale="zh"
      >
        打开 X 工具
      </MarketingResourceLink>
    );

    await user.click(screen.getByRole("link", { name: "打开 X 工具" }));
    expect(captureEvent).toHaveBeenCalledWith("marketing_resource_clicked", {
      resourceType: "tool",
      slug: "twitter-thread-generator",
      surface: "landing",
      locale: "zh"
    });
  });

  it("captures the content source when a visitor follows a conversion CTA", async () => {
    const user = userEvent.setup();
    render(
      <TrackedCtaLink
        href="#signup"
        sourceType="blog_post"
        sourceSlug="product-hunt-maker-comment-guide"
        destination="signup"
        locale="en"
      >
        Try Finfold
      </TrackedCtaLink>
    );

    await user.click(screen.getByRole("link", { name: "Try Finfold" }));
    expect(captureEvent).toHaveBeenCalledWith("marketing_cta_clicked", {
      cta_id: "blog_post:product-hunt-maker-comment-guide:signup",
      source_type: "blog_post",
      source_slug: "product-hunt-maker-comment-guide",
      source_surface: "content",
      destination: "signup",
      locale: "en"
    });
  });
});
