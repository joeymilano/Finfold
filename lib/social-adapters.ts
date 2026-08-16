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

export type SocialPost = {
  externalPostId: string;
  url: string | null;
  publishedAt: string | null;
  text: string | null;
};

export type SocialPostMetrics = {
  externalPostId: string;
  impressions: number | null;
  uniqueImpressions: number | null;
  reactions: number | null;
  comments: number | null;
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
  listOwnedPosts(credentials: SocialAdapterCredentials): Promise<SocialAdapterResult<SocialPost[]>>;
  publish(credentials: SocialAdapterCredentials): Promise<SocialAdapterResult<never>>;
  pollPostMetrics(credentials: SocialAdapterCredentials): Promise<SocialAdapterResult<SocialPostMetrics[]>>;
  pollAccountMetrics(credentials: SocialAdapterCredentials): Promise<SocialAdapterResult<never>>;
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
    profile_image_url: z.string().url().optional()
  })
});

// LinkedIn OpenID Connect UserInfo (identity). `sub` is the stable member id.
const linkedInUserInfoSchema = z.object({
  sub: z.string().min(1).max(64),
  name: z.string().min(1).max(160).optional(),
  given_name: z.string().max(160).optional(),
  family_name: z.string().max(160).optional(),
  picture: z.string().optional()
});

// LinkedIn ugcPosts (the member's own published posts). Field names follow the
// current Community Management API; verify against LinkedIn's docs during the
// live integration pass.
const linkedInUgcPostsSchema = z.object({
  elements: z.array(
    z.object({
      id: z.string().min(1),
      firstPublishedAt: z.coerce.number().int().nonnegative().optional(),
      specificContent: z
        .object({
          "com.linkedin.ugc.PostContent": z
            .object({
              shareCommentary: z.object({ text: z.string().optional() }).optional()
            })
            .optional()
        })
        .optional()
    })
  ).max(200)
});

// LinkedIn memberCreatorPostAnalytics (read-only per-post statistics). Metric
// field names follow LinkedIn's Member Post Statistics; verify during the live
// integration pass and treat any missing metric as null rather than failing.
const linkedInPostAnalyticsSchema = z.object({
  elements: z.array(
    z.object({
      urn: z.string().min(1),
      totalImpressions: z.coerce.number().int().nonnegative().optional(),
      uniqueImpressions: z.coerce.number().int().nonnegative().optional(),
      totalEngagement: z.coerce.number().int().nonnegative().optional(),
      totalComments: z.coerce.number().int().nonnegative().optional()
    })
  ).max(200)
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
  return {
    connectorId: "x",
    async listAccounts(credentials) {
      const response = await fetcher(
        "https://api.x.com/2/users/me?user.fields=profile_image_url",
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

      return {
        kind: "ok",
        value: [{
          externalAccountId: payload.data.data.id,
          accountType: "profile",
          handle: `@${payload.data.data.username}`,
          displayName: payload.data.data.name,
          avatarUrl: safeHttpsUrl(payload.data.data.profile_image_url)
        }]
      };
    },
    async listOwnedPosts() {
      return unsupported("x", "list_published_posts");
    },
    async publish() {
      return unsupported("x", "publish");
    },
    async pollPostMetrics() {
      return unsupported("x", "post_metrics");
    },
    async pollAccountMetrics() {
      return unsupported("x", "account_metrics");
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
  const fetchUserInfo = async (credentials: SocialAdapterCredentials) => {
    const response = await fetcher("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${credentials.accessToken}`, Accept: "application/json" },
      cache: "no-store"
    });
    if (!response.ok) {
      throw new SocialAdapterError("The LinkedIn profile could not be read. Reconnect the account and try again.");
    }
    const payload = linkedInUserInfoSchema.safeParse(await response.json());
    if (!payload.success) {
      throw new SocialAdapterError("LinkedIn returned an invalid profile response.");
    }
    return payload.data;
  };

  return {
    connectorId: "linkedin",
    async listAccounts(credentials) {
      const profile = await fetchUserInfo(credentials);
      const displayName = profile.name?.trim()
        || [profile.given_name, profile.family_name].filter(Boolean).join(" ").trim()
        || profile.sub;
      return {
        kind: "ok",
        value: [{
          externalAccountId: profile.sub,
          accountType: "profile",
          handle: null,
          displayName,
          avatarUrl: safeHttpsUrl(profile.picture)
        }]
      };
    },
    async listOwnedPosts(credentials) {
      const profile = await fetchUserInfo(credentials);
      const authorUrn = `urn:li:person:${profile.sub}`;
      const url = new URL("https://api.linkedin.com/v2/ugcPosts");
      url.search = new URLSearchParams({
        q: "authors",
        authors: authorUrn,
        count: "50",
        sortBy: "LAST_POSTED"
      }).toString();
      const response = await fetcher(url.toString(), {
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          Accept: "application/json",
          "X-Restli-Protocol-Version": "2.0.0"
        },
        cache: "no-store"
      });
      if (!response.ok) {
        throw new SocialAdapterError("LinkedIn posts could not be read. Reconnect the account and try again.");
      }
      const payload = linkedInUgcPostsSchema.safeParse(await response.json());
      if (!payload.success) {
        throw new SocialAdapterError("LinkedIn returned an invalid posts response.");
      }
      return {
        kind: "ok",
        value: payload.data.elements.map((element) => ({
          externalPostId: element.id,
          url: null,
          publishedAt: element.firstPublishedAt ? new Date(element.firstPublishedAt).toISOString() : null,
          text: element.specificContent?.["com.linkedin.ugc.PostContent"]?.shareCommentary?.text ?? null
        }))
      };
    },
    async pollPostMetrics(credentials) {
      const profile = await fetchUserInfo(credentials);
      const authorUrn = `urn:li:person:${profile.sub}`;
      const url = new URL("https://api.linkedin.com/rest/memberCreatorPostAnalytics");
      url.search = new URLSearchParams({
        q: "author",
        author: authorUrn,
        count: "50",
        sortBy: "LAST_POSTED"
      }).toString();
      const response = await fetcher(url.toString(), {
        headers: { Authorization: `Bearer ${credentials.accessToken}`, Accept: "application/json" },
        cache: "no-store"
      });
      if (!response.ok) {
        throw new SocialAdapterError("LinkedIn post analytics could not be read. Reconnect the account and try again.");
      }
      const payload = linkedInPostAnalyticsSchema.safeParse(await response.json());
      if (!payload.success) {
        throw new SocialAdapterError("LinkedIn returned an invalid analytics response.");
      }
      const polledAt = new Date().toISOString();
      return {
        kind: "ok",
        value: payload.data.elements.map((element) => ({
          externalPostId: element.urn,
          impressions: element.totalImpressions ?? null,
          uniqueImpressions: element.uniqueImpressions ?? null,
          reactions: element.totalEngagement ?? null,
          comments: element.totalComments ?? null,
          polledAt
        }))
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

function createManualAdapter(connectorId: Exclude<SocialConnectorId, "x" | "linkedin">): SocialAdapter {
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
  return createManualAdapter(connectorId);
}