import { describe, expect, it } from "vitest";
import { getAuthCallbackUrl } from "@/lib/auth-callback-url";

describe("getAuthCallbackUrl", () => {
  it("keeps a staging confirmation on the staging deployment", () => {
    expect(
      getAuthCallbackUrl(
        new Request("https://finfold-app-staging.example.workers.dev/api/auth/signup"),
        { appUrl: "https://www.finfold.app", deploymentEnv: "production" }
      )
    ).toBe("https://finfold-app-staging.example.workers.dev/auth/callback");
  });

  it("supports local development without a deployment-specific fallback", () => {
    expect(
      getAuthCallbackUrl(new Request("http://localhost:3000/api/auth/oauth"), {
        appUrl: "https://www.finfold.app",
        deploymentEnv: undefined
      })
    ).toBe("http://localhost:3000/auth/callback");
  });

  it("uses the staging build URL for OpenNext's production loopback request", () => {
    expect(
      getAuthCallbackUrl(new Request("http://localhost:3000/api/auth/signup"), {
        appUrl: "https://finfold-app-staging.example.workers.dev",
        deploymentEnv: "staging"
      })
    ).toBe("https://finfold-app-staging.example.workers.dev/auth/callback");
  });

  it("does not trust an invalid production fallback", () => {
    expect(
      getAuthCallbackUrl(new Request("http://localhost:3000/api/auth/signup"), {
        appUrl: "javascript:alert(1)",
        deploymentEnv: "production"
      })
    ).toBe("http://localhost:3000/auth/callback");
  });

  it("carries a safe Starter return target through OAuth and email confirmation", () => {
    expect(
      getAuthCallbackUrl(
        new Request("https://www.finfold.app/api/auth/oauth"),
        { appUrl: "https://www.finfold.app", deploymentEnv: "production" },
        "/billing?plan=starter"
      )
    ).toBe("https://www.finfold.app/auth/callback?next=%2Fbilling%3Fplan%3Dstarter");
  });

  it("carries a sanitized signup method into the callback for funnel completion", () => {
    expect(
      getAuthCallbackUrl(
        new Request("https://www.finfold.app/api/auth/oauth"),
        { appUrl: "https://www.finfold.app", deploymentEnv: "production" },
        "/operations/account-health",
        {
          mode: "signup",
          method: "Google",
          signupFlowId: "flow-12345678",
          trafficClass: "qa"
        }
      )
    ).toBe(
      "https://www.finfold.app/auth/callback?next=%2Foperations%2Faccount-health&auth_mode=signup&auth_method=google&signup_flow_id=flow-12345678&traffic_class=qa"
    );
  });

  it("drops untrusted funnel identifiers instead of reflecting them into the callback", () => {
    expect(
      getAuthCallbackUrl(
        new Request("https://www.finfold.app/api/auth/oauth"),
        { appUrl: "https://www.finfold.app", deploymentEnv: "production" },
        "/dashboard",
        {
          mode: "signup",
          method: "google",
          signupFlowId: "../../bad?value",
          trafficClass: "internal"
        }
      )
    ).toBe(
      "https://www.finfold.app/auth/callback?next=%2Fdashboard&auth_mode=signup&auth_method=google"
    );
  });

  it("replaces an external callback target with Mission Control", () => {
    expect(
      getAuthCallbackUrl(
        new Request("https://www.finfold.app/api/auth/oauth"),
        { appUrl: "https://www.finfold.app", deploymentEnv: "production" },
        "https://evil.example/steal"
      )
    ).toBe("https://www.finfold.app/auth/callback?next=%2Fdashboard");
  });
});
