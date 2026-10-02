import { z } from "zod";
import {
  getSocialConnectorCapability,
  type SocialConnectorId,
  type SocialOperation
} from "@/lib/social-platform-capabilities";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type SocialAdapterCredentials = {
  accessToken: string;
  refreshToken: string | null;
};

export type SocialExternalAccount = {
  externalAccountId: string;
  accountType: "profile" | "page" | "organization";
  handle: string | null;
  displayName: string;
  avatarUrl: string | null;
};

export type SocialAdapterTarget = Pick<
  SocialExternalAccount,
  "externalAccountId" | "accountType"
>;

export type SocialPost = {
  externalPostId: string;
  url: string | null;
  publishedAt: string | null;
  text: string | null;
};

export type SocialPostMetrics = {
  externalPostId: string;
  impressions: number | null;
  views: number | null;
  reach: number | null;
  uniqueImpressions: number | null;
  reactions: number | null;
  comments: number | null;
  polledAt: string;
};

export type SocialAccountMetrics = {
  externalAccountId: string;
  followerCount: number | null;
  views: number | null;
  reach: number | null;
  profileViews: number | null;
  polledAt: string;
};

export type SocialAdapterSuccess<T> = {
  kind: "ok";
  value: T;
};

export type SocialAdapterUnsupported = {
  kind: "unsupported";
  operation: SocialOperation | "refresh" | "revoke";
  reason: string;
};

export type SocialAdapterResult<T> = SocialAdapterSuccess<T> | SocialAdapterUnsupported;

export type SocialAdapter = {
  readonly connectorId: SocialConnectorId;
  listAccounts(credentials: SocialAdapterCredentials): Promise<SocialAdapterResult<SocialExternalAccount[]>>;
  listOwnedPosts(
    credentials: SocialAdapterCredentials,
    target?: SocialAdapterTarget
  ): Promise<SocialAdapterResult<SocialPost[]>>;
  publish(credentials: SocialAdapterCredentials): Promise<SocialAdapterResult<never>>;
  pollPostMetrics(
    credentials: SocialAdapterCredentials,
    target?: SocialAdapterTarget
  ): Promise<SocialAdapterResult<SocialPostMetrics[]>>;
  pollAccountMetrics(
    credentials: SocialAdapterCredentials,
    target?: SocialAdapterTarget
  ): Promise<SocialAdapterResult<SocialAccountMetrics[]>>;
  refresh(credentials: SocialAdapterCredentials): Promise<SocialAdapterResult<SocialAdapterCredentials>>;
  revoke(credentials: SocialAdapterCredentials): Promise<SocialAdapterResult<never>>;
};

export class SocialAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SocialAdapterError";
  }
}

const xAccountSchema = z.object({
  data: z.object({
    id: z.string().regex(/^\d{1,19}$/),
    name: z.string().min(1).max(160),
    username: z.string().regex(/^[A-Za-z0-9_]{1,15}$/),
    profile_image_url: z.string().url().optional(),
    public_metrics: z.object({
      followers_count: z.coerce.number().int().nonnegative().optional()
    }).optional()
  })
});

const xOwnedPostsSchema = z.object({
  data: z.array(z.object({
    id: z.string().regex(/^\d{1,19}$/),
    text: z.string().max(10_000),
    created_at: z.string().datetime().optional()
  })).max(100).optional()
});

const linkedInOrganizationAclsSchema = z.object({
  elements: z.array(z.object({
    role: z.string().min(1).max(128),
    state: z.string().min(1).max(128),
    organization: z.string().min(1).max(255).optional(),
    organizationTarget: z.string().min(1).max(255).optional()
  })).max(200),
  paging: z.object({
    start: z.coerce.number().int().nonnegative().optional(),
    count: z.coerce.number().int().positive().optional(),
    links: z.array(z.object({ rel: z.string().max(64).optional() })).max(20).optional()
  }).optional()
});

const linkedInOrganizationsSchema = z.object({
  results: z.record(z.string(), z.object({
    id: z.coerce.number().int().positive(),
    localizedName: z.string().min(1).max(300).optional(),
    vanityName: z.string().min(1).max(200).optional()
  }))
});

const linkedInPostsSchema = z.object({
  elements: z.array(
    z.object({
      id: z.string().min(1),
      publishedAt: z.coerce.number().int().nonnegative().optional(),
      createdAt: z.coerce.number().int().nonnegative().optional(),
      commentary: z.string().max(20_000).optional()
    })
  ).max(200)
});

const linkedInOrganizationShareStatisticsSchema = z.object({
  elements: z.array(
    z.object({
      share: z.string().min(1).optional(),
      ugcPost: z.string().min(1).optional(),
      totalShareStatistics: z.object({
        impressionCount: z.coerce.number().int().nonnegative().optional(),
        uniqueImpressionsCount: z.coerce.number().int().nonnegative().optional(),
        likeCount: z.coerce.number().int().optional(),
        commentCount: z.coerce.number().int().nonnegative().optional()
      })
    })
  ).max(200)
});

const instagramAccountSchema = z.object({
  id: z.string().regex(/^\d{1,32}$/),
  user_id: z.string().regex(/^\d{1,32}$/).optional(),
  username: z.string().min(1).max(64),
  name: z.string().max(160).optional(),
  profile_picture_url: z.string().optional(),
  account_type: z.enum(["BUSINESS", "MEDIA_CREATOR", "CREATOR"]).optional(),
  followers_count: z.coerce.number().int().nonnegative().optional()
});

const instagramMediaSchema = z.object({
  data: z.array(z.object({
    id: z.string().regex(/^\d{1,32}$/),
    caption: z.string().max(20_000).optional(),
    media_type: z.string().max(64).optional(),
    permalink: z.string().optional(),
    timestamp: z.string().datetime({ offset: true }).optional(),
    like_count: z.coerce.number().int().nonnegative().optional(),
    comments_count: z.coerce.number().int().nonnegative().optional()
  })).max(100).optional()
});

const instagramInsightsSchema = z.object({
  data: z.array(z.object({
    name: z.string().min(1).max(128),
    values: z.array(z.object({ value: z.coerce.number().nonnegative() })).max(100).optional(),
    total_value: z.object({ value: z.coerce.number().nonnegative() }).optional()
  })).max(100).optional()
});

function safeHttpsUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

function unsupported(
  connectorId: SocialConnectorId,
  operation: SocialOperation | "refresh" | "revoke"
): SocialAdapterUnsupported {
  const capability = getSocialConnectorCapability(connectorId);
  return {
    kind: "unsupported",
    operation,
    reason: operation in capability.official.operations
      ? `${capability.label} ${operation.replaceAll("_", " ")} is not enabled in Finfold.`
      : `${capability.label} ${operation} is not enabled in Finfold.`
  };
}

function createXAdapter(fetcher: FetchLike): SocialAdapter {
  const fetchXAccount = async (credentials: SocialAdapterCredentials) => {
    const response = await fetcher(
      "https://api.x.com/2/users/me?user.fields=profile_image_url,public_metrics",
      {
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          Accept: "application/json"
        },
        cache: "no-store"
      }
    );

    if (!response.ok) {
      throw new SocialAdapterError("The X account could not be read. Reconnect the account and try again.");
    }

    const payload = xAccountSchema.safeParse(await response.json());
    if (!payload.success) {
      throw new SocialAdapterError("X returned an invalid account response.");
    }
    return payload.data.data;
  };

  return {
    connectorId: "x",
    async listAccounts(credentials) {
      const account = await fetchXAccount(credentials);

      return {
        kind: "ok",
        value: [{
          externalAccountId: account.id,
          accountType: "profile",
          handle: `@${account.username}`,
          displayName: account.name,
          avatarUrl: safeHttpsUrl(account.profile_image_url)
        }]
      };
    },
    async listOwnedPosts(credentials) {
      const account = await fetchXAccount(credentials);
      const url = new URL(`https://api.x.com/2/users/${account.id}/tweets`);
      url.search = new URLSearchParams({
        max_results: "10",
        "tweet.fields": "created_at"
      }).toString();
      const response = await fetcher(url.toString(), {
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          Accept: "application/json"
        },
        cache: "no-store"
      });
      if (!response.ok) {
        throw new SocialAdapterError("Recent X posts could not be read. Reconnect the account and try again.");
      }
      const payload = xOwnedPostsSchema.safeParse(await response.json());
      if (!payload.success) {
        throw new SocialAdapterError("X returned an invalid posts response.");
      }
      return {
        kind: "ok",
        value: (payload.data.data ?? []).map((post) => ({
          externalPostId: post.id,
          url: `https://x.com/${account.username}/status/${post.id}`,
          publishedAt: post.created_at ?? null,
          text: post.text
        }))
      };
    },
    async publish() {
      return unsupported("x", "publish");
    },
    async pollPostMetrics() {
      return unsupported("x", "post_metrics");
    },
    async pollAccountMetrics(credentials) {
      // Account-level public_metrics ride the same users.read scope the
      // connection already grants, so the growth portfolio can mirror the
      // follower count without any extra permission.
      const account = await fetchXAccount(credentials);
      return {
        kind: "ok",
        value: [{
          externalAccountId: account.id,
          followerCount: account.public_metrics?.followers_count ?? null,
          views: null,
          reach: null,
          profileViews: null,
          polledAt: new Date().toISOString()
        }]
      };
    },
    async refresh() {
      return unsupported("x", "refresh");
    },
    async revoke() {
      return unsupported("x", "revoke");
    }
  };
}

function createLinkedInAdapter(fetcher: FetchLike): SocialAdapter {
  const linkedinVersion = process.env.LINKEDIN_API_VERSION?.trim();
  const apiVersion = linkedinVersion && /^20\d{4}$/.test(linkedinVersion)
    ? linkedinVersion
    : "202608";
  const readHeaders = (credentials: SocialAdapterCredentials) => ({
    Authorization: `Bearer ${credentials.accessToken}`,
    Accept: "application/json",
    "Linkedin-Version": apiVersion,
    "X-Restli-Protocol-Version": "2.0.0"
  });
  const organizationIdFromUrn = (value: string | undefined): string | null => {
    const match = value?.match(/^urn:li:organization:(\d{1,19})$/);
    return match?.[1] ?? null;
  };
  const requireOrganizationTarget = (target: SocialAdapterTarget | undefined): string => {
    if (target?.accountType !== "organization" || !/^\d{1,19}$/.test(target.externalAccountId)) {
      throw new SocialAdapterError("Select a LinkedIn company page before reading posts or performance.");
    }
    return target.externalAccountId;
  };
  const fetchOrganizationPosts = async (
    credentials: SocialAdapterCredentials,
    target: SocialAdapterTarget | undefined
  ): Promise<z.infer<typeof linkedInPostsSchema>["elements"]> => {
    const organizationId = requireOrganizationTarget(target);
    const url = new URL("https://api.linkedin.com/rest/posts");
    url.search = new URLSearchParams({
      author: `urn:li:organization:${organizationId}`,
      q: "author",
      count: "100",
      sortBy: "LAST_MODIFIED"
    }).toString();
    const response = await fetcher(url.toString(), {
      headers: {
        ...readHeaders(credentials),
        "X-RestLi-Method": "FINDER"
      },
      cache: "no-store"
    });
    if (!response.ok) {
      throw new SocialAdapterError("LinkedIn company posts could not be read. Check the Page role and Community Management approval.");
    }
    const payload = linkedInPostsSchema.safeParse(await response.json());
    if (!payload.success) {
      throw new SocialAdapterError("LinkedIn returned an invalid company posts response.");
    }
    return payload.data.elements;
  };

  return {
    connectorId: "linkedin",
    async listAccounts(credentials) {
      const organizationIdSet = new Set<string>();
      const pageSize = 100;
      let start = 0;
      for (let page = 0; page < 20; page += 1) {
        const accessUrl = new URL("https://api.linkedin.com/rest/organizationAcls");
        accessUrl.search = new URLSearchParams({
          q: "roleAssignee",
          role: "ADMINISTRATOR",
          state: "APPROVED",
          count: String(pageSize),
          start: String(start)
        }).toString();
        const accessResponse = await fetcher(accessUrl.toString(), {
          headers: {
            ...readHeaders(credentials),
            "X-RestLi-Method": "FINDER"
          },
          cache: "no-store"
        });
        if (!accessResponse.ok) {
          throw new SocialAdapterError("LinkedIn company pages could not be read. Check Community Management approval and reconnect.");
        }
        const access = linkedInOrganizationAclsSchema.safeParse(await accessResponse.json());
        if (!access.success) {
          throw new SocialAdapterError("LinkedIn returned an invalid company access response.");
        }
        const previousSize = organizationIdSet.size;
        for (const item of access.data.elements) {
          if (item.state !== "APPROVED" || item.role !== "ADMINISTRATOR") continue;
          const id = organizationIdFromUrn(item.organizationTarget ?? item.organization);
          if (id) organizationIdSet.add(id);
        }
        const hasNextLink = access.data.paging?.links?.some((link) => link.rel?.toLowerCase() === "next") ?? false;
        if (!hasNextLink && access.data.elements.length < pageSize) break;
        if (organizationIdSet.size === previousSize && page > 0) break;
        start = (access.data.paging?.start ?? start) + (access.data.paging?.count ?? pageSize);
      }
      const organizationIds = [...organizationIdSet];
      if (organizationIds.length === 0) return { kind: "ok", value: [] };

      const organizations = new Map<string, { localizedName?: string; vanityName?: string }>();
      for (let index = 0; index < organizationIds.length; index += 50) {
        const ids = organizationIds.slice(index, index + 50);
        const organizationsUrl = new URL("https://api.linkedin.com/rest/organizations");
        organizationsUrl.searchParams.set("ids", `List(${ids.join(",")})`);
        const response = await fetcher(organizationsUrl.toString(), {
          headers: readHeaders(credentials),
          cache: "no-store"
        });
        if (!response.ok) {
          throw new SocialAdapterError("LinkedIn company page details could not be read. Reconnect the account and try again.");
        }
        const payload = linkedInOrganizationsSchema.safeParse(await response.json());
        if (!payload.success) {
          throw new SocialAdapterError("LinkedIn returned an invalid company page response.");
        }
        for (const [id, organization] of Object.entries(payload.data.results)) {
          organizations.set(id, organization);
        }
      }

      return {
        kind: "ok",
        value: organizationIds.flatMap((id) => {
          const organization = organizations.get(id);
          if (!organization) return [];
          return [{
            externalAccountId: id,
            accountType: "organization" as const,
            handle: organization.vanityName ?? null,
            displayName: organization.localizedName?.trim() || organization.vanityName || `LinkedIn Page ${id}`,
            avatarUrl: null
          }];
        })
      };
    },
    async listOwnedPosts(credentials, target) {
      const posts = await fetchOrganizationPosts(credentials, target);
      return {
        kind: "ok",
        value: posts.map((element) => {
          const publishedAt = element.publishedAt ?? element.createdAt;
          return {
            externalPostId: element.id,
            url: null,
            publishedAt: publishedAt === undefined ? null : new Date(publishedAt).toISOString(),
            text: element.commentary ?? null
          };
        })
      };
    },
    async pollPostMetrics(credentials, target) {
      const organizationId = requireOrganizationTarget(target);
      const posts = await fetchOrganizationPosts(credentials, target);
      const groups = [
        { parameter: "shares" as const, ids: posts.map((post) => post.id).filter((id) => id.startsWith("urn:li:share:")) },
        { parameter: "ugcPosts" as const, ids: posts.map((post) => post.id).filter((id) => id.startsWith("urn:li:ugcPost:")) }
      ].filter((group) => group.ids.length > 0);
      const rows: z.infer<typeof linkedInOrganizationShareStatisticsSchema>["elements"] = [];
      for (const group of groups) {
        for (let index = 0; index < group.ids.length; index += 20) {
          const ids = group.ids.slice(index, index + 20);
          const url = new URL("https://api.linkedin.com/rest/organizationalEntityShareStatistics");
          url.searchParams.set("q", "organizationalEntity");
          url.searchParams.set("organizationalEntity", `urn:li:organization:${organizationId}`);
          if (group.parameter === "shares") {
            url.searchParams.set("shares", `List(${ids.join(",")})`);
          } else {
            ids.forEach((id, itemIndex) => url.searchParams.set(`ugcPosts[${itemIndex}]`, id));
          }
          const response = await fetcher(url.toString(), {
            headers: readHeaders(credentials),
            cache: "no-store"
          });
          if (!response.ok) {
            throw new SocialAdapterError("LinkedIn company post analytics could not be read. Check the Page role and Community Management approval.");
          }
          const payload = linkedInOrganizationShareStatisticsSchema.safeParse(await response.json());
          if (!payload.success) {
            throw new SocialAdapterError("LinkedIn returned an invalid company analytics response.");
          }
          rows.push(...payload.data.elements);
        }
      }
      const polledAt = new Date().toISOString();
      const statisticsByPostId = new Map(rows.flatMap((element) => {
        const externalPostId = element.share ?? element.ugcPost;
        return externalPostId ? [[externalPostId, element.totalShareStatistics] as const] : [];
      }));
      return {
        kind: "ok",
        value: posts.flatMap((post) => {
          const statistics = statisticsByPostId.get(post.id);
          if (!statistics) return [];
          const likeCount = statistics.likeCount;
          return [{
            externalPostId: post.id,
            impressions: statistics.impressionCount ?? null,
            views: null,
            reach: null,
            uniqueImpressions: statistics.uniqueImpressionsCount ?? null,
            reactions: likeCount !== undefined && likeCount >= 0 ? likeCount : null,
            comments: statistics.commentCount ?? null,
            polledAt
          }];
        })
      };
    },
    async publish() {
      return unsupported("linkedin", "publish");
    },
    async pollAccountMetrics() {
      return unsupported("linkedin", "account_metrics");
    },
    async refresh() {
      return unsupported("linkedin", "refresh");
    },
    async revoke() {
      return unsupported("linkedin", "revoke");
    }
  };
}

function instagramGraphUrl(path: string): URL {
  const configuredVersion = process.env.INSTAGRAM_GRAPH_API_VERSION?.trim();
  const version = configuredVersion && /^v\d{1,2}\.\d$/.test(configuredVersion)
    ? configuredVersion
    : "v23.0";
  return new URL(`https://graph.instagram.com/${version}/${path.replace(/^\//, "")}`);
}

function insightValue(
  payload: z.infer<typeof instagramInsightsSchema>,
  metric: string
): number | null {
  const row = payload.data?.find((item) => item.name === metric);
  if (!row) return null;
  if (row.total_value) return row.total_value.value;
  if (!row.values?.length) return null;
  return row.values.reduce((total, item) => total + item.value, 0);
}

function createInstagramAdapter(fetcher: FetchLike): SocialAdapter {
  const authorizedFetch = async (url: URL, credentials: SocialAdapterCredentials) => fetcher(url, {
    headers: {
      Authorization: `Bearer ${credentials.accessToken}`,
      Accept: "application/json"
    },
    cache: "no-store"
  });

  const fetchAccount = async (credentials: SocialAdapterCredentials) => {
    const url = instagramGraphUrl("me");
    url.searchParams.set(
      "fields",
      "id,user_id,username,name,profile_picture_url,account_type,followers_count"
    );
    const response = await authorizedFetch(url, credentials);
    if (!response.ok) {
      throw new SocialAdapterError("The Instagram professional account could not be read. Reconnect it and try again.");
    }
    const payload = instagramAccountSchema.safeParse(await response.json());
    if (!payload.success) throw new SocialAdapterError("Instagram returned an invalid account response.");
    return payload.data;
  };

  const fetchMedia = async (credentials: SocialAdapterCredentials) => {
    const url = instagramGraphUrl("me/media");
    url.searchParams.set(
      "fields",
      "id,caption,media_type,permalink,timestamp,like_count,comments_count"
    );
    url.searchParams.set("limit", "25");
    const response = await authorizedFetch(url, credentials);
    if (!response.ok) {
      throw new SocialAdapterError("Instagram media could not be read. Reconnect the account and try again.");
    }
    const payload = instagramMediaSchema.safeParse(await response.json());
    if (!payload.success) throw new SocialAdapterError("Instagram returned an invalid media response.");
    return payload.data.data ?? [];
  };

  return {
    connectorId: "instagram",
    async listAccounts(credentials) {
      const account = await fetchAccount(credentials);
      return {
        kind: "ok",
        value: [{
          externalAccountId: account.id,
          accountType: "profile",
          handle: `@${account.username}`,
          displayName: account.name?.trim() || account.username,
          avatarUrl: safeHttpsUrl(account.profile_picture_url)
        }]
      };
    },
    async listOwnedPosts(credentials) {
      const media = await fetchMedia(credentials);
      return {
        kind: "ok",
        value: media.map((item) => ({
          externalPostId: item.id,
          url: safeHttpsUrl(item.permalink),
          publishedAt: item.timestamp ?? null,
          text: item.caption ?? null
        }))
      };
    },
    async pollPostMetrics(credentials) {
      const media = await fetchMedia(credentials);
      const polledAt = new Date().toISOString();
      return {
        kind: "ok",
        value: await Promise.all(media.map(async (item) => {
          const url = instagramGraphUrl(`${item.id}/insights`);
          url.searchParams.set("metric", "views,reach,total_interactions");
          const response = await authorizedFetch(url, credentials);
          let insights: z.infer<typeof instagramInsightsSchema> = { data: [] };
          if (response.ok) {
            const parsed = instagramInsightsSchema.safeParse(await response.json());
            if (parsed.success) insights = parsed.data;
          }
          return {
            externalPostId: item.id,
            impressions: null,
            views: insightValue(insights, "views"),
            reach: insightValue(insights, "reach"),
            uniqueImpressions: null,
            reactions: item.like_count ?? insightValue(insights, "total_interactions"),
            comments: item.comments_count ?? null,
            polledAt
          };
        }))
      };
    },
    async pollAccountMetrics(credentials) {
      const account = await fetchAccount(credentials);
      const url = instagramGraphUrl(`${account.id}/insights`);
      url.searchParams.set("metric", "views,reach,profile_views");
      url.searchParams.set("period", "day");
      url.searchParams.set("metric_type", "total_value");
      url.searchParams.set("since", Math.floor((Date.now() - 28 * 86_400_000) / 1_000).toString());
      url.searchParams.set("until", Math.floor(Date.now() / 1_000).toString());
      const response = await authorizedFetch(url, credentials);
      let insights: z.infer<typeof instagramInsightsSchema> = { data: [] };
      if (response.ok) {
        const parsed = instagramInsightsSchema.safeParse(await response.json());
        if (parsed.success) insights = parsed.data;
      }
      return {
        kind: "ok",
        value: [{
          externalAccountId: account.id,
          followerCount: account.followers_count ?? null,
          views: insightValue(insights, "views"),
          reach: insightValue(insights, "reach"),
          profileViews: insightValue(insights, "profile_views"),
          polledAt: new Date().toISOString()
        }]
      };
    },
    async publish() {
      return unsupported("instagram", "publish");
    },
    async refresh() {
      return unsupported("instagram", "refresh");
    },
    async revoke() {
      return unsupported("instagram", "revoke");
    }
  };
}

function createManualAdapter(connectorId: Exclude<SocialConnectorId, "x" | "linkedin" | "instagram">): SocialAdapter {
  return {
    connectorId,
    async listAccounts() {
      return unsupported(connectorId, "list_published_posts");
    },
    async listOwnedPosts() {
      return unsupported(connectorId, "list_published_posts");
    },
    async publish() {
      return unsupported(connectorId, "publish");
    },
    async pollPostMetrics() {
      return unsupported(connectorId, "post_metrics");
    },
    async pollAccountMetrics() {
      return unsupported(connectorId, "account_metrics");
    },
    async refresh() {
      return unsupported(connectorId, "refresh");
    },
    async revoke() {
      return unsupported(connectorId, "revoke");
    }
  };
}

/**
 * Returns an explicit unsupported response for every operation that Finfold has
 * not enabled. Callers must never infer support from a content-generation target.
 */
export function getSocialAdapter(
  connectorId: SocialConnectorId,
  fetcher: FetchLike = fetch
): SocialAdapter {
  if (connectorId === "x") return createXAdapter(fetcher);
  if (connectorId === "linkedin") return createLinkedInAdapter(fetcher);
  if (connectorId === "instagram") return createInstagramAdapter(fetcher);
  return createManualAdapter(connectorId);
}
