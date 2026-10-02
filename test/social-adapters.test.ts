import { describe, expect, it } from "vitest";
import { getSocialAdapter } from "@/lib/social-adapters";

describe("social adapters", () => {
  it("normalizes the authenticated X profile without exposing its access token", async () => {
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input).toBe("https://api.x.com/2/users/me?user.fields=profile_image_url,public_metrics");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer private-access-token");
      expect(String(input)).not.toContain("private-access-token");
      return new Response(JSON.stringify({
        data: {
          id: "2244994945",
          name: "X Developers",
          username: "XDevelopers",
          profile_image_url: "https://pbs.twimg.com/profile_images/example.jpg",
          public_metrics: { followers_count: 1_234 }
        }
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    const result = await getSocialAdapter("x", fetcher).listAccounts({
      accessToken: "private-access-token",
      refreshToken: null
    });

    expect(result).toEqual({
      kind: "ok",
      value: [{
        externalAccountId: "2244994945",
        accountType: "profile",
        handle: "@XDevelopers",
        displayName: "X Developers",
        avatarUrl: "https://pbs.twimg.com/profile_images/example.jpg"
      }]
    });

    const metrics = await getSocialAdapter("x", fetcher).pollAccountMetrics({
      accessToken: "private-access-token",
      refreshToken: null
    });
    expect(metrics).toEqual({
      kind: "ok",
      value: [{
        externalAccountId: "2244994945",
        followerCount: 1_234,
        views: null,
        reach: null,
        profileViews: null,
        polledAt: expect.any(String)
      }]
    });
  });

  it("does not turn officially possible publishing into a live publishing method", async () => {
    const result = await getSocialAdapter("x").publish({
      accessToken: "private-access-token",
      refreshToken: null
    });

    expect(result).toMatchObject({
      kind: "unsupported",
      operation: "publish"
    });
  });

  it("reads recent owned X posts through the read-only OAuth scope", async () => {
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      const target = String(input);
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer private-access-token");
      if (target.includes("/users/me")) {
        return new Response(JSON.stringify({
          data: { id: "2244994945", name: "X Developers", username: "XDevelopers" }
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      expect(target).toContain("/2/users/2244994945/tweets");
      expect(target).toContain("max_results=10");
      return new Response(JSON.stringify({
        data: [{ id: "1888888888888888888", text: "Build in public", created_at: "2026-08-17T01:00:00.000Z" }]
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const result = await getSocialAdapter("x", fetcher).listOwnedPosts({
      accessToken: "private-access-token",
      refreshToken: null
    });
    expect(result).toEqual({
      kind: "ok",
      value: [{
        externalPostId: "1888888888888888888",
        url: "https://x.com/XDevelopers/status/1888888888888888888",
        publishedAt: "2026-08-17T01:00:00.000Z",
        text: "Build in public"
      }]
    });
  });

  it("returns a concrete unsupported result for manual-only connectors", async () => {
    const result = await getSocialAdapter("moments").listAccounts({
      accessToken: "unused",
      refreshToken: null
    });

    expect(result).toMatchObject({
      kind: "unsupported",
      operation: "list_published_posts"
    });
  });

  it("discovers multiple LinkedIn company Pages from one approved member grant", async () => {
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer li-token");
      expect(headers.get("linkedin-version")).toBe("202608");
      expect(headers.get("x-restli-protocol-version")).toBe("2.0.0");
      if (url.pathname.endsWith("/organizationAcls")) {
        expect(url.searchParams.get("q")).toBe("roleAssignee");
        expect(url.searchParams.get("role")).toBe("ADMINISTRATOR");
        expect(url.searchParams.get("state")).toBe("APPROVED");
        if (url.searchParams.get("start") === "0") {
          return new Response(JSON.stringify({
            elements: [
              { role: "ADMINISTRATOR", state: "APPROVED", organization: "urn:li:organization:79988552" },
              { role: "CONTENT_ADMINISTRATOR", state: "APPROVED", organizationTarget: "urn:li:organization:111" }
            ],
            paging: { start: 0, count: 100, links: [{ rel: "next" }] }
          }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
        expect(url.searchParams.get("start")).toBe("100");
        return new Response(JSON.stringify({
          elements: [
            { role: "ADMINISTRATOR", state: "APPROVED", organizationTarget: "urn:li:organization:90966477" },
            { role: "ADMINISTRATOR", state: "REVOKED", organization: "urn:li:organization:222" }
          ],
          paging: { start: 100, count: 100, links: [] }
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      expect(url.pathname).toBe("/rest/organizations");
      expect(url.searchParams.get("ids")).toBe("List(79988552,90966477)");
      return new Response(JSON.stringify({
        results: {
          "79988552": { id: 79988552, localizedName: "Finfold", vanityName: "finfold" },
          "90966477": { id: 90966477, localizedName: "One Percent Design Lab", vanityName: "one-percent-design-lab" }
        }
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    const result = await getSocialAdapter("linkedin", fetcher).listAccounts({
      accessToken: "li-token",
      refreshToken: null
    });

    expect(result).toEqual({
      kind: "ok",
      value: [
        {
          externalAccountId: "79988552",
          accountType: "organization",
          handle: "finfold",
          displayName: "Finfold",
          avatarUrl: null
        },
        {
          externalAccountId: "90966477",
          accountType: "organization",
          handle: "one-percent-design-lab",
          displayName: "One Percent Design Lab",
          avatarUrl: null
        }
      ]
    });
  });

  it("lists posts for the exact selected LinkedIn company Page", async () => {
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe("/rest/posts");
      expect(url.searchParams.get("author")).toBe("urn:li:organization:79988552");
      expect(url.searchParams.get("q")).toBe("author");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer li-token");
      return new Response(JSON.stringify({
        elements: [
          {
            id: "urn:li:ugcPost:123",
            publishedAt: 1690000000000,
            commentary: "Launch day"
          },
          { id: "urn:li:share:456" }
        ]
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    const result = await getSocialAdapter("linkedin", fetcher).listOwnedPosts({
      accessToken: "li-token",
      refreshToken: null
    }, {
      externalAccountId: "79988552",
      accountType: "organization"
    });

    expect(result).toEqual({
      kind: "ok",
      value: [
        { externalPostId: "urn:li:ugcPost:123", url: null, publishedAt: new Date(1690000000000).toISOString(), text: "Launch day" },
        { externalPostId: "urn:li:share:456", url: null, publishedAt: null, text: null }
      ]
    });
  });

  it("reads organization post analytics and leaves unavailable metrics null", async () => {
    const fetcher = async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/posts")) {
        return new Response(JSON.stringify({
          elements: [
            { id: "urn:li:ugcPost:123", publishedAt: 1690000000000 },
            { id: "urn:li:share:456", publishedAt: 1690000001000 }
          ]
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      expect(url.pathname).toBe("/rest/organizationalEntityShareStatistics");
      expect(url.searchParams.get("organizationalEntity")).toBe("urn:li:organization:79988552");
      if (url.searchParams.has("ugcPosts[0]")) {
        expect(url.searchParams.get("ugcPosts[0]")).toBe("urn:li:ugcPost:123");
        return new Response(JSON.stringify({
          elements: [{
            ugcPost: "urn:li:ugcPost:123",
            totalShareStatistics: {
              impressionCount: 1234,
              uniqueImpressionsCount: 1100,
              likeCount: 42,
              commentCount: 7
            }
          }]
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      expect(url.searchParams.get("shares")).toBe("List(urn:li:share:456)");
      return new Response(JSON.stringify({
        elements: [{
          share: "urn:li:share:456",
          totalShareStatistics: { impressionCount: 50, likeCount: -1 }
        }]
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    const result = await getSocialAdapter("linkedin", fetcher).pollPostMetrics({
      accessToken: "li-token",
      refreshToken: null
    }, {
      externalAccountId: "79988552",
      accountType: "organization"
    });

    expect(result).toMatchObject({
      kind: "ok",
      value: [
        { externalPostId: "urn:li:ugcPost:123", impressions: 1234, uniqueImpressions: 1100, reactions: 42, comments: 7 },
        { externalPostId: "urn:li:share:456", impressions: 50, uniqueImpressions: null, reactions: null, comments: null }
      ]
    });
  });

  it("keeps LinkedIn publishing explicitly unsupported", async () => {
    const result = await getSocialAdapter("linkedin").publish({
      accessToken: "li-token",
      refreshToken: null
    });

    expect(result).toMatchObject({ kind: "unsupported", operation: "publish" });
  });

  it("rejects invalid grants and requires an exact LinkedIn company Page target", async () => {
    const invalidFetcher = async () => new Response(JSON.stringify({ unexpected: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    await expect(getSocialAdapter("linkedin", invalidFetcher).listAccounts({
      accessToken: "li-token",
      refreshToken: null
    })).rejects.toThrow(/invalid company access response/);

    const unauthorizedFetcher = async () => new Response("{}", { status: 401 });
    await expect(getSocialAdapter("linkedin", unauthorizedFetcher).listAccounts({
      accessToken: "li-token",
      refreshToken: null
    })).rejects.toThrow(/company pages could not be read/);

    await expect(getSocialAdapter("linkedin").listOwnedPosts({
      accessToken: "li-token",
      refreshToken: null
    })).rejects.toThrow(/Select a LinkedIn company page/);
  });

  it("normalizes an Instagram professional account and its owned media", async () => {
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer ig-token");
      expect(url.hostname).toBe("graph.instagram.com");
      if (url.pathname.endsWith("/me")) {
        return new Response(JSON.stringify({
          id: "17841400000000001",
          username: "finfoldapp",
          name: "Finfold",
          account_type: "BUSINESS",
          profile_picture_url: "https://cdn.example/ig.jpg",
          followers_count: 321
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      expect(url.pathname).toContain("/me/media");
      return new Response(JSON.stringify({ data: [{
        id: "18000000000000001",
        caption: "A measurable launch",
        media_type: "IMAGE",
        permalink: "https://www.instagram.com/p/example/",
        timestamp: "2026-08-25T09:00:00+00:00",
        like_count: 12,
        comments_count: 3
      }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    await expect(getSocialAdapter("instagram", fetcher).listAccounts({
      accessToken: "ig-token",
      refreshToken: null
    })).resolves.toEqual({
      kind: "ok",
      value: [{
        externalAccountId: "17841400000000001",
        accountType: "profile",
        handle: "@finfoldapp",
        displayName: "Finfold",
        avatarUrl: "https://cdn.example/ig.jpg"
      }]
    });

    await expect(getSocialAdapter("instagram", fetcher).listOwnedPosts({
      accessToken: "ig-token",
      refreshToken: null
    })).resolves.toEqual({
      kind: "ok",
      value: [{
        externalPostId: "18000000000000001",
        url: "https://www.instagram.com/p/example/",
        publishedAt: "2026-08-25T09:00:00+00:00",
        text: "A measurable launch"
      }]
    });
  });

  it("reads Instagram media and account Insights while keeping publishing disabled", async () => {
    const fetcher = async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/me/media")) {
        return new Response(JSON.stringify({ data: [{
          id: "18000000000000001",
          like_count: 12,
          comments_count: 3
        }] }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.pathname.endsWith("/18000000000000001/insights")) {
        return new Response(JSON.stringify({ data: [
          { name: "views", total_value: { value: 900 } },
          { name: "reach", total_value: { value: 750 } }
        ] }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.pathname.endsWith("/me")) {
        return new Response(JSON.stringify({
          id: "17841400000000001",
          username: "finfoldapp",
          followers_count: 321
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      expect(url.pathname).toContain("/17841400000000001/insights");
      return new Response(JSON.stringify({ data: [
        { name: "views", total_value: { value: 4200 } },
        { name: "reach", total_value: { value: 3100 } },
        { name: "profile_views", total_value: { value: 88 } }
      ] }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const adapter = getSocialAdapter("instagram", fetcher);
    const credentials = { accessToken: "ig-token", refreshToken: null };

    await expect(adapter.pollPostMetrics(credentials)).resolves.toMatchObject({
      kind: "ok",
      value: [{
        externalPostId: "18000000000000001",
        impressions: null,
        views: 900,
        reach: 750,
        uniqueImpressions: null,
        reactions: 12,
        comments: 3
      }]
    });
    await expect(adapter.pollAccountMetrics(credentials)).resolves.toMatchObject({
      kind: "ok",
      value: [{
        externalAccountId: "17841400000000001",
        followerCount: 321,
        views: 4200,
        reach: 3100,
        profileViews: 88
      }]
    });
    await expect(adapter.publish(credentials)).resolves.toMatchObject({
      kind: "unsupported",
      operation: "publish"
    });
  });
});
