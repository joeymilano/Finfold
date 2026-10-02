import { describe, expect, it } from "vitest";
import {
  accountInvestigationInputSchema,
  buildBrowserEvidenceHandoff,
  buildAccountHealthMatrix,
  buildInsufficientEvidenceReport,
  collectPublicAccountEvidence,
  enforceEvidenceCeiling,
  enforceWorkbenchReadiness,
  resolveEvidenceLevel,
  resolveSocialAccountProfile,
  scanDeterministicPostRisks,
  type AccountInvestigation,
  type AccountInvestigationReport,
  type PublicAccountEvidence
} from "@/lib/agent/account-investigation";
import type { safeExternalFetchWithTrace } from "@/lib/safe-url";
import { getAgentTool, normalizeAgentImageUrls } from "@/lib/agent/tools";

function tracedResponse(
  html: string,
  init: ResponseInit = {},
  redirectChain: string[] = []
): Awaited<ReturnType<typeof safeExternalFetchWithTrace>> {
  return {
    response: new Response(html, { status: 200, headers: { "content-type": "text/html" }, ...init }),
    redirectChain
  };
}

function publicEvidence(overrides: Partial<PublicAccountEvidence> = {}): PublicAccountEvidence {
  return {
    platform: "x",
    accountUrl: "https://x.com/example",
    captureMethod: "public_web",
    capturedAt: "2026-08-11T00:00:00.000Z",
    httpStatus: 200,
    pageTitle: "Example (@example) / X",
    visibleText: "Example public profile and recent posts",
    signals: [{ kind: "profile_visible", detail: "public" }],
    limitations: ["Public analytics are unavailable."],
    ...overrides
  };
}

function report(overrides: Partial<AccountInvestigationReport> = {}): AccountInvestigationReport {
  return {
    headline: "Reach needs investigation",
    caseState: "low_reach",
    confidence: "medium",
    confidenceReason: "Recent reach is below the supplied baseline.",
    executiveSummary: "Reach is low, but there is no enforcement evidence.",
    evidence: [{ finding: "Views declined", source: "user_report", strength: "weak" }],
    hypotheses: [{
      cause: "Weak opening hook",
      category: "content",
      likelihood: "medium",
      why: "The supplied data shows views but no recommendation-source collapse.",
      verifyNext: "Compare the next three posts against the same baseline."
    }],
    recoveryPlan: {
      next24Hours: ["Preserve the current analytics snapshot."],
      next7Days: ["Run one controlled content test."],
      appeal: { needed: false, officialPath: "", draft: "" }
    },
    workbenchPlan: {
      strategy: "Test the diagnosed content bottleneck before changing multiple variables.",
      actions: [{
        id: "rebuild_hook",
        kind: "controlled_experiment",
        title: "Rebuild the opening hook",
        priority: "now",
        readiness: "ready",
        rationale: "The opening is the strongest current hypothesis.",
        deliverable: "One editable three-post X test package.",
        successSignal: "Compare recommendation reach across the next three posts.",
        brief: "Create three variants that hold the topic constant and test only the opening hook.",
        agentPrompt: "This value is replaced by Finfold's trusted execution wrapper."
      }]
    },
    doNotDo: ["Do not mass-delete posts."],
    nextEvidence: ["Add creator analytics."],
    recheckCriteria: ["Compare three posts over seven days."],
    ...overrides
  };
}

describe("social account profile resolution", () => {
  it("exposes the investigation as a paid read-only Agent capability", () => {
    const tool = getAgentTool("investigate_social_account");
    expect(tool).toBeDefined();
    expect(tool?.mutates).toBe(false);
    expect(tool?.requiresAgentTools).toBe(true);
    expect(tool?.parameters).toMatchObject({ required: [] });
    expect(tool?.parameters).toMatchObject({ properties: { posts: { maxItems: 5 } } });
    expect(tool?.description).toContain("低阅读本身不得判定为限流");
  });

  it("ignores private attachment ids in URL-only tool arguments", () => {
    expect(normalizeAgentImageUrls([
      "bbd5c160-d834-4598-bfab-123456789012",
      "https://signed.example/account.png",
      "javascript:alert(1)"
    ])).toEqual(["https://signed.example/account.png"]);
  });

  it("normalizes X and legacy Twitter profile URLs", () => {
    expect(resolveSocialAccountProfile("twitter.com/Finfold_AI?ref=share")).toMatchObject({
      platform: "x",
      accountUrl: "https://x.com/Finfold_AI",
      fetchUrl: "https://x.com/Finfold_AI",
      handle: "Finfold_AI"
    });
  });

  it("keeps only the Xiaohongshu access parameters needed to read a shared profile", () => {
    const profile = resolveSocialAccountProfile(
      "https://www.xiaohongshu.com/user/profile/abc123?xsec_token=share-token&utm_source=tracking"
    );
    expect(profile.accountUrl).toBe("https://www.xiaohongshu.com/user/profile/abc123");
    expect(profile.fetchUrl).toContain("xsec_token=share-token");
    expect(profile.fetchUrl).not.toContain("utm_source");
  });

  it("accepts the xhslink.cn share domain used by the Xiaohongshu app", () => {
    expect(resolveSocialAccountProfile("https://xhslink.cn/m/8RZZ1xl8TcN")).toMatchObject({
      platform: "xiaohongshu",
      accountUrl: "https://xhslink.cn/m/8RZZ1xl8TcN",
      fetchUrl: "https://xhslink.cn/m/8RZZ1xl8TcN",
      handle: null
    });
  });

  it("normalizes Reddit user profiles and rejects post URLs", () => {
    expect(resolveSocialAccountProfile("https://reddit.com/u/Finfold_AI")).toMatchObject({
      platform: "reddit",
      accountUrl: "https://www.reddit.com/user/Finfold_AI/",
      handle: "Finfold_AI"
    });
    expect(() => resolveSocialAccountProfile("https://www.reddit.com/r/startups/comments/abc/example"))
      .toThrow(/Reddit 用户主页|Reddit user profile/i);
  });

  it("rejects post URLs and lookalike domains", () => {
    expect(() => resolveSocialAccountProfile("https://x.com/example/status/123")).toThrow(/主页链接|profile URL/i);
    expect(() => resolveSocialAccountProfile("https://x.com.evil.example/example")).toThrow(/支持小红书|supports Xiaohongshu/i);
  });
});

describe("public account evidence", () => {
  it("treats an explicit suspension page as a platform notice", async () => {
    const fetchPage: typeof safeExternalFetchWithTrace = async () => tracedResponse(
      "<html><title>Account suspended / X</title><body>Account suspended. X suspends accounts that violate the X Rules.</body></html>",
      {},
      ["https://x.com/example"]
    );
    const evidence = await collectPublicAccountEvidence(
      resolveSocialAccountProfile("https://x.com/example"),
      fetchPage
    );
    expect(evidence.captureMethod).toBe("public_web");
    expect(evidence.signals).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "platform_notice" })
    ]));
    expect(resolveEvidenceLevel(evidence, { analyticsText: "", imageUrls: [] })).toBe("platform_notice");
  });

  it("does not turn a failed public fetch into a suspension claim", async () => {
    const fetchPage: typeof safeExternalFetchWithTrace = async () => {
      throw new Error("blocked by login wall");
    };
    const evidence = await collectPublicAccountEvidence(
      resolveSocialAccountProfile("https://x.com/example"),
      fetchPage
    );
    expect(evidence.captureMethod).toBe("unavailable");
    expect(evidence.signals).toEqual([]);
    expect(evidence.limitations.join(" ")).toContain("不代表账号被限流、删除或封禁");
  });
});

describe("identity recovery from redirect chain", () => {
  const profilePath = (id: string) => `/user/profile/${id}`;
  const profileUrl = (id: string) => `https://www.xiaohongshu.com${profilePath(id)}`;

  function loginWallTrace(id: string, chainHopsIncludeProfile: boolean): ReturnType<typeof tracedResponse> {
    const redirectPath = encodeURIComponent(`${profileUrl(id)}?xsec_token=share`);
    const loginUrl = `https://www.xiaohongshu.com/login?redirectPath=${redirectPath}`;
    const chain = chainHopsIncludeProfile
      ? ["https://xhslink.cn/o/3QRuDSWEZio", `${profileUrl(id)}?xsec_token=share&xsec_source=app_share`, loginUrl]
      : ["https://xhslink.cn/o/3QRuDSWEZio", loginUrl];
    return tracedResponse(
      "<html><title>小红书 - 你的生活兴趣社区</title></html>",
      {},
      chain
    );
  }

  it("recovers the Xiaohongshu profile id when the share link lands on a login wall", async () => {
    const id = "5f5f329a000000000101ca36";
    const fetchPage: typeof safeExternalFetchWithTrace = async () => loginWallTrace(id, true);
    const evidence = await collectPublicAccountEvidence(
      resolveSocialAccountProfile("https://xhslink.cn/o/3QRuDSWEZio"),
      fetchPage
    );

    expect(evidence.identifiedAccount).toEqual({
      handle: id,
      accountUrl: profileUrl(id),
      source: "redirect_chain"
    });
    expect(evidence.accountUrl).toBe(profileUrl(id));
    expect(evidence.signals).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "login_wall" })
    ]));
    expect(evidence.limitations.join(" ")).toContain("登录墙");
    expect(resolveEvidenceLevel(evidence, { analyticsText: "", imageUrls: [] })).toBe("link_only");
  });

  it("falls back to the login wall redirectPath when no profile hop is visible", async () => {
    const id = "5f5f329a000000000101ca36";
    const fetchPage: typeof safeExternalFetchWithTrace = async () => loginWallTrace(id, false);
    const evidence = await collectPublicAccountEvidence(
      resolveSocialAccountProfile("https://xhslink.cn/o/3QRuDSWEZio"),
      fetchPage
    );
    expect(evidence.identifiedAccount).toMatchObject({ handle: id, source: "login_redirect" });
  });

  it("flags a share link that resolves to the Xiaohongshu homepage as expired", async () => {
    const fetchPage: typeof safeExternalFetchWithTrace = async () => tracedResponse(
      "<html><title>小红书 - 你的生活兴趣社区</title></html>",
      {},
      ["https://xhslink.cn/o/DEADBEEF", "https://www.xiaohongshu.com/"]
    );
    const evidence = await collectPublicAccountEvidence(
      resolveSocialAccountProfile("https://xhslink.cn/o/DEADBEEF"),
      fetchPage
    );
    expect(evidence.identifiedAccount).toBeUndefined();
    expect(evidence.shareLinkIssue).toBe("expired_or_invalid");
    expect(evidence.limitations.join(" ")).toContain("已过期");
    expect(evidence.limitations.join(" ")).toContain("重新获取");
  });

  it("flags a share link that resolves to a note instead of a profile", async () => {
    const fetchPage: typeof safeExternalFetchWithTrace = async () => tracedResponse(
      "<html><title>小红书 - 你的生活兴趣社区</title></html>",
      {},
      ["https://xhslink.cn/a/NOTE1", "https://www.xiaohongshu.com/explore/note123"]
    );
    const evidence = await collectPublicAccountEvidence(
      resolveSocialAccountProfile("https://xhslink.cn/a/NOTE1"),
      fetchPage
    );
    expect(evidence.shareLinkIssue).toBe("points_to_note");
    expect(evidence.limitations.join(" ")).toContain("笔记");
  });

  it("accepts LinkedIn personal profiles and rejects company pages", () => {
    expect(resolveSocialAccountProfile("https://www.linkedin.com/in/williamhgates/")).toMatchObject({
      platform: "linkedin",
      accountUrl: "https://www.linkedin.com/in/williamhgates/",
      fetchUrl: "https://www.linkedin.com/in/williamhgates/",
      handle: "williamhgates"
    });
    expect(() => resolveSocialAccountProfile("https://www.linkedin.com/company/finfold"))
      .toThrow(/个人主页|personal profile/i);
  });

  it("marks an identified account even when the public body stays empty", async () => {
    const fetchPage: typeof safeExternalFetchWithTrace = async () => tracedResponse(
      "<html><body>Bill Gates - Chair, Gates Foundation | LinkedIn Sign in to view profile</body></html>",
      {},
      ["https://www.linkedin.com/in/williamhgates"]
    );
    const evidence = await collectPublicAccountEvidence(
      resolveSocialAccountProfile("https://www.linkedin.com/in/williamhgates"),
      fetchPage
    );
    expect(evidence.identifiedAccount).toMatchObject({ handle: "williamhgates", source: "pasted_url" });
  });
});

describe("insufficient-evidence reporting", () => {
  it("reports an identified-but-walled Xiaohongshu account with a concrete next step", () => {
    const id = "5f5f329a000000000101ca36";
    const report = buildInsufficientEvidenceReport("zh", publicEvidence({
      platform: "xiaohongshu",
      accountUrl: `https://www.xiaohongshu.com/user/profile/${id}`,
      visibleText: "",
      signals: [{ kind: "login_wall", detail: "小红书把公开访问重定向到了登录页。" }],
      identifiedAccount: { handle: id, accountUrl: `https://www.xiaohongshu.com/user/profile/${id}`, source: "redirect_chain" },
      limitations: ["公开页面没有返回足够正文，可能是动态渲染、登录墙或反自动化限制。"]
    }));
    expect(report.caseState).toBe("insufficient_evidence");
    expect(report.headline).toContain("已定位");
    expect(report.executiveSummary).toContain("user/5f5f329a");
    expect(report.executiveSummary).toContain("不是限流");
    expect(report.evidence[0]).toMatchObject({ source: "public_profile", strength: "confirmed" });
    expect(report.recoveryPlan.next24Hours.join(" ")).toContain("截图");
  });

  it("keeps the generic headline when nothing about the account could be identified", () => {
    const report = buildInsufficientEvidenceReport("zh", publicEvidence({
      platform: "x",
      visibleText: "",
      signals: [],
      limitations: []
    }));
    expect(report.headline).toBe("公开页面暂时无法确认账号状态");
    expect(report.evidence).toEqual([]);
  });

  it("tells the user outright when a share link is invalid or expired", () => {
    const report = buildInsufficientEvidenceReport("zh", publicEvidence({
      platform: "xiaohongshu",
      accountUrl: "https://xhslink.cn/o/DEADBEEF",
      visibleText: "",
      signals: [],
      shareLinkIssue: "expired_or_invalid",
      limitations: ["这条分享短链没有解析出账号主页：短码可能复制不完整、大小写有出入或已过期。"]
    }));
    expect(report.headline).toContain("无效或已过期");
    expect(report.executiveSummary).toContain("重新");
  });
});

describe("health matrix identity readout", () => {
  it("shows the located account in the presence dimension when the page is walled", () => {
    const id = "5f5f329a000000000101ca36";
    const evidence = publicEvidence({
      platform: "xiaohongshu",
      accountUrl: `https://www.xiaohongshu.com/user/profile/${id}`,
      visibleText: "",
      signals: [{ kind: "login_wall", detail: "登录墙" }],
      identifiedAccount: { handle: id, accountUrl: `https://www.xiaohongshu.com/user/profile/${id}`, source: "redirect_chain" }
    });
    const investigation: AccountInvestigation = {
      reportId: "FF-XHS-20260920-ABC123",
      reportVersion: "1.2",
      generatedAt: evidence.capturedAt,
      platform: "xiaohongshu",
      accountUrl: evidence.accountUrl,
      evidenceLevel: "link_only",
      publicEvidence: {
        platform: evidence.platform,
        accountUrl: evidence.accountUrl,
        captureMethod: evidence.captureMethod,
        capturedAt: evidence.capturedAt,
        httpStatus: evidence.httpStatus,
        pageTitle: evidence.pageTitle,
        signals: evidence.signals,
        limitations: evidence.limitations,
        identifiedAccount: evidence.identifiedAccount
      },
      report: buildInsufficientEvidenceReport("zh", evidence),
      browserHandoff: buildBrowserEvidenceHandoff("xiaohongshu", "link_only", "insufficient_evidence", "zh")
    };
    const matrix = buildAccountHealthMatrix(investigation, "zh");
    const presence = matrix.find((item) => item.key === "presence");
    expect(presence?.status).toBe("unknown");
    expect(presence?.finding).toContain("user/5f5f329a");
    expect(presence?.finding).toContain("已定位账号");
  });
});

describe("diagnostic evidence ceiling", () => {
  it("deterministically catches obvious promise and engagement-bait wording before the model explanation", () => {
    const findings = scanDeterministicPostRisks([{
      text: "保证成功，评论区扣 1 领资料"
    }], "xiaohongshu", "zh");
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: "misleading_claim", excerpt: "保证成功", status: "potential" }),
      expect.objectContaining({ category: "engagement_bait", status: "potential" })
    ]));
    expect(findings.every((finding) => finding.saferRewrite.length > 0)).toBe(true);
  });

  it("treats supplied post text as a content sample that can be scanned without fabricating analytics", () => {
    const evidence = publicEvidence({ captureMethod: "unavailable", visibleText: "", signals: [] });
    const input = accountInvestigationInputSchema.parse({
      accountUrl: "https://x.com/example",
      posts: [{ text: "Guaranteed results in three days. Comment YES for the file." }],
      locale: "en"
    });
    expect(resolveEvidenceLevel(evidence, input)).toBe("content_sample");
  });

  it("accepts screenshot-only diagnosis and still rejects empty intake", () => {
    const screenshotInput = accountInvestigationInputSchema.parse({
      platform: "reddit",
      imageUrls: ["https://example.com/account.png"],
      locale: "en"
    });
    expect(screenshotInput.platform).toBe("reddit");
    expect(screenshotInput.accountUrl).toBeUndefined();

    expect(() => accountInvestigationInputSchema.parse({ locale: "zh" })).toThrow(/主页链接|截图/);
  });

  it("downgrades a claimed confirmed risk phrase when no platform notice names the violation", () => {
    const input = accountInvestigationInputSchema.parse({
      accountUrl: "https://x.com/example",
      posts: [{ text: "Guaranteed results in three days." }],
      locale: "en"
    });
    const result = enforceEvidenceCeiling(report({
      contentRisks: [{
        postIndex: 1,
        excerpt: "Guaranteed results",
        category: "misleading_claim",
        severity: "high",
        status: "confirmed",
        platformBasis: "Absolute outcome promise.",
        why: "The promise may be misleading.",
        saferRewrite: "Here are the results from our own test.",
        verifyNext: "Compare review status after the rewrite."
      }]
    }), publicEvidence(), input);
    expect(result.contentRisks?.[0]?.status).toBe("supported");
  });

  it("does not call low views a visibility restriction without a recommendation-traffic break", () => {
    const input = accountInvestigationInputSchema.parse({
      accountUrl: "https://x.com/example",
      concern: "low_reach",
      analyticsText: "My last post received only 20 views.",
      locale: "en"
    });
    const result = enforceEvidenceCeiling(report({
      caseState: "suspected_visibility_restriction",
      confidence: "medium"
    }), publicEvidence(), input);
    expect(result.caseState).toBe("low_reach");
    expect(result.confidenceReason).toContain("not yet supported");
  });

  it("keeps a suspected restriction when creator data shows a cross-post distribution break", () => {
    const input = accountInvestigationInputSchema.parse({
      accountUrl: "https://x.com/example",
      concern: "suspected_restriction",
      analyticsText: "Across the last five posts, non-follower recommendation traffic had a sharp drop from 70% to 0%.",
      locale: "en"
    });
    const result = enforceEvidenceCeiling(report({
      caseState: "suspected_visibility_restriction",
      confidence: "medium"
    }), publicEvidence(), input);
    expect(result.caseState).toBe("suspected_visibility_restriction");
  });

  it("downgrades an unsupported suspension verdict and removes the appeal", () => {
    const input = accountInvestigationInputSchema.parse({
      accountUrl: "https://x.com/example",
      concern: "suspended",
      analyticsText: "Views are lower this week.",
      locale: "en"
    });
    const result = enforceEvidenceCeiling(report({
      caseState: "account_suspended",
      confidence: "high",
      evidence: [{ finding: "Views are low", source: "user_report", strength: "weak" }],
      recoveryPlan: {
        next24Hours: ["Appeal now."],
        next7Days: [],
        appeal: { needed: true, officialPath: "Appeal", draft: "Please restore my account." }
      }
    }), publicEvidence(), input);

    expect(result.caseState).toBe("insufficient_evidence");
    expect(result.confidence).toBe("low");
    expect(result.recoveryPlan.appeal).toEqual({ needed: false, officialPath: "", draft: "" });
  });

  it("keeps a confirmed verdict when an explicit platform notice is present", () => {
    const input = accountInvestigationInputSchema.parse({
      accountUrl: "https://x.com/example",
      analyticsText: "Account suspended. You can file an appeal.",
      locale: "en"
    });
    const result = enforceEvidenceCeiling(report({
      caseState: "account_suspended",
      confidence: "high",
      evidence: [{ finding: "Account suspended", source: "platform_notice", strength: "confirmed" }]
    }), publicEvidence(), input);
    expect(result.caseState).toBe("account_suspended");
  });

  it("requests authenticated evidence for a public-profile-only diagnosis", () => {
    const handoff = buildBrowserEvidenceHandoff("xiaohongshu", "public_profile", "low_reach", "zh");
    expect(handoff.required).toBe(true);
    expect(handoff.captureChecklist.join(" ")).toContain("7/30 天数据总览");
    expect(handoff.readOnlySteps.join(" ")).toContain("不修改或删除");
  });

  it("turns a ready prescription into a trusted X Workbench execution prompt", () => {
    const result = enforceWorkbenchReadiness(report(), "x", "zh");
    const action = result.workbenchPlan.actions[0];
    expect(action.readiness).toBe("ready");
    expect(action.agentPrompt).toContain("调用 X 内容包 workflow");
    expect(action.agentPrompt).toContain("PRESCRIPTION_JSON=");
    expect(action.agentPrompt).toContain("不得直接发布");
    expect(action.agentPrompt).not.toContain("This value is replaced");
  });

  it("blocks Workbench prescriptions while an enforcement issue is unresolved", () => {
    const result = enforceWorkbenchReadiness(report({ caseState: "account_suspended" }), "x", "en");
    expect(result.workbenchPlan.actions[0].readiness).toBe("blocked");
  });

  it("keeps unknown health dimensions unknown instead of fabricating green scores", () => {
    const evidence = publicEvidence();
    const investigation: AccountInvestigation = {
      reportId: "FF-X-20260811-ABC123",
      reportVersion: "1.1",
      generatedAt: evidence.capturedAt,
      platform: "x",
      accountUrl: evidence.accountUrl,
      evidenceLevel: "public_profile",
      publicEvidence: {
        platform: evidence.platform,
        accountUrl: evidence.accountUrl,
        captureMethod: evidence.captureMethod,
        capturedAt: evidence.capturedAt,
        httpStatus: evidence.httpStatus,
        pageTitle: evidence.pageTitle,
        signals: evidence.signals,
        limitations: evidence.limitations
      },
      report: report(),
      browserHandoff: buildBrowserEvidenceHandoff("x", "public_profile", "low_reach", "en")
    };
    const matrix = buildAccountHealthMatrix(investigation, "en");
    expect(matrix.find((item) => item.key === "presence")?.status).toBe("stable");
    expect(matrix.find((item) => item.key === "distribution")?.status).toBe("watch");
    expect(matrix.find((item) => item.key === "policy")?.status).toBe("unknown");
  });
});
