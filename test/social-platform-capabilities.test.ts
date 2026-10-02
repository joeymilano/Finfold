import { describe, expect, it } from "vitest";
import { platforms } from "@/lib/platforms";
import {
  getSocialConnectorCapabilities,
  getSocialConnectorCapability,
  socialPlatformCapabilities
} from "@/lib/social-platform-capabilities";

describe("socialPlatformCapabilities", () => {
  it("keeps publishing disabled while exposing only implemented read paths", () => {
    for (const capability of Object.values(socialPlatformCapabilities)) {
      expect(capability.current.publishing).toBe(false);
      expect(capability.current.publishingHandoff).toBe(
        ["wechat", "linkedin", "xiaohongshu"].includes(capability.id)
      );
    }
    expect(getSocialConnectorCapability("instagram").current).toMatchObject({
      connection: "oauth",
      automaticPostDiscovery: true,
      postMetrics: "oauth_read",
      accountMetrics: true,
      publishing: false
    });
    expect(getSocialConnectorCapability("wechat").current.accountMetrics).toBe(true);
  });

  it("covers every generated-content platform", () => {
    for (const platform of platforms) {
      expect(getSocialConnectorCapabilities(platform.id)).not.toHaveLength(0);
    }
  });

  it("keeps Medium and Substack distinct under the shared content target", () => {
    const capabilities = getSocialConnectorCapabilities("medium-substack");

    expect(capabilities.map((capability) => capability.id)).toEqual(["medium", "substack"]);
    expect(getSocialConnectorCapability("medium").official.operations.publish).toBe("unsupported");
    expect(getSocialConnectorCapability("substack").official.operations.publish).toBe("unsupported");
  });

  it("documents official write capability without enabling it in Finfold", () => {
    for (const connectorId of ["x", "linkedin", "threads"] as const) {
      const capability = getSocialConnectorCapability(connectorId);
      expect(capability.official.connectionMethod).toBe("oauth");
      expect(capability.official.operations.publish).toBe("supported");
      expect(capability.current.publishing).toBe(false);
    }
  });

  it("preserves the existing manual URL metrics integrations", () => {
    for (const connectorId of ["x", "reddit", "product-hunt", "hacker-news"] as const) {
      expect(getSocialConnectorCapability(connectorId).current.postMetrics).toBe("manual_url_polling");
    }
  });
});
