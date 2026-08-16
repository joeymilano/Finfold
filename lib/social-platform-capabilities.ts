import type { PlatformId } from "@/lib/platforms";

export const socialConnectorIds = [
  "wechat",
  "xiaohongshu",
  "zhihu",
  "moments",
  "x",
  "linkedin",
  "instagram",
  "facebook",
  "reddit",
  "product-hunt",
  "threads",
  "hacker-news",
  "indie-hackers",
  "medium",
  "substack"
] as const;

export type SocialConnectorId = (typeof socialConnectorIds)[number];

export type OfficialAccess = "supported" | "restricted" | "unsupported";
export type OfficialConnectionMethod = "oauth" | "managed_account_credentials" | "app_token" | "none";
export type CurrentConnectionSupport = "unavailable" | "legacy_user_token" | "oauth";
export type CurrentPostMetricsSupport = "unavailable" | "manual_url_polling" | "oauth_read";

export type SocialOperation = "list_published_posts" | "publish" | "post_metrics" | "account_metrics";

export type SocialPlatformCapability = {
  id: SocialConnectorId;
  contentPlatform: PlatformId;
  label: string;
  official: {
    connectionMethod: OfficialConnectionMethod;
    accountTypes: readonly string[];
    operations: Readonly<Record<SocialOperation, OfficialAccess>>;
    requirements: readonly string[];
  };
  current: {
    connection: CurrentConnectionSupport;
    automaticPostDiscovery: false;
    publishing: false;
    postMetrics: CurrentPostMetricsSupport;
    accountMetrics: false;
  };
  manualFallback: string;
};

const manualOnly = {
  connection: "unavailable",
  automaticPostDiscovery: false,
  publishing: false,
  postMetrics: "unavailable",
  accountMetrics: false
} as const;

const manualUrlMetrics = {
  ...manualOnly,
  postMetrics: "manual_url_polling"
} as const;

const linkedInOAuthRead = {
  connection: "oauth",
  automaticPostDiscovery: false,
  publishing: false,
  postMetrics: "oauth_read",
  accountMetrics: false
} as const;

const supported = "supported" as const;
const restricted = "restricted" as const;
const unsupported = "unsupported" as const;

export const socialPlatformCapabilities: Record<SocialConnectorId, SocialPlatformCapability> = {
  wechat: {
    id: "wechat",
    contentPlatform: "wechat",
    label: "WeChat Official Account",
    official: {
      connectionMethod: "managed_account_credentials",
      accountTypes: ["Certified Official Account", "Certified Service Account"],
      operations: {
        list_published_posts: restricted,
        publish: restricted,
        post_metrics: restricted,
        account_metrics: restricted
      },
      requirements: ["Eligible certified account", "Official API permissions"]
    },
    current: manualOnly,
    manualFallback: "Publish in WeChat and import metrics manually."
  },
  xiaohongshu: {
    id: "xiaohongshu",
    contentPlatform: "xiaohongshu",
    label: "Xiaohongshu / RED",
    official: {
      connectionMethod: "managed_account_credentials",
      accountTypes: ["Qualified merchant or service-provider account"],
      operations: {
        list_published_posts: unsupported,
        publish: unsupported,
        post_metrics: unsupported,
        account_metrics: unsupported
      },
      requirements: ["The public platform is for ecommerce integrations, not creator posts"]
    },
    current: manualOnly,
    manualFallback: "Publish in Xiaohongshu and import metrics manually."
  },
  zhihu: {
    id: "zhihu",
    contentPlatform: "zhihu",
    label: "Zhihu",
    official: {
      connectionMethod: "none",
      accountTypes: [],
      operations: {
        list_published_posts: unsupported,
        publish: unsupported,
        post_metrics: unsupported,
        account_metrics: unsupported
      },
      requirements: ["No public self-service creator API documented for ordinary author posts"]
    },
    current: manualOnly,
    manualFallback: "Publish in Zhihu, declare AI assistance when applicable, and import metrics manually."
  },
  moments: {
    id: "moments",
    contentPlatform: "moments",
    label: "WeChat Moments",
    official: {
      connectionMethod: "none",
      accountTypes: [],
      operations: {
        list_published_posts: unsupported,
        publish: unsupported,
        post_metrics: unsupported,
        account_metrics: unsupported
      },
      requirements: ["No public personal-account API"]
    },
    current: manualOnly,
    manualFallback: "Publish in Moments and record outcomes manually."
  },
  x: {
    id: "x",
    contentPlatform: "x",
    label: "X / Twitter",
    official: {
      connectionMethod: "oauth",
      accountTypes: ["X account with eligible developer access"],
      operations: {
        list_published_posts: restricted,
        publish: supported,
        post_metrics: restricted,
        account_metrics: restricted
      },
      requirements: ["Approved developer account", "Project and App", "User-context access token"]
    },
    current: {
      connection: "legacy_user_token",
      automaticPostDiscovery: false,
      publishing: false,
      postMetrics: "manual_url_polling",
      accountMetrics: false
    },
    manualFallback: "Paste a published URL; Finfold can poll likes and replies when a user bearer token is configured."
  },
  linkedin: {
    id: "linkedin",
    contentPlatform: "linkedin",
    label: "LinkedIn",
    official: {
      connectionMethod: "oauth",
      accountTypes: ["Member", "Organization administrator or content admin"],
      operations: {
        list_published_posts: restricted,
        publish: supported,
        post_metrics: restricted,
        account_metrics: restricted
      },
      requirements: ["Required member or organization social scopes", "Organization role for organization access"]
    },
    current: linkedInOAuthRead,
    manualFallback: "Connect LinkedIn to import read-only post analytics automatically."
  },
  instagram: {
    id: "instagram",
    contentPlatform: "instagram",
    label: "Instagram",
    official: {
      connectionMethod: "oauth",
      accountTypes: ["Professional Instagram account"],
      operations: {
        list_published_posts: restricted,
        publish: restricted,
        post_metrics: restricted,
        account_metrics: restricted
      },
      requirements: ["Meta app access", "Professional account", "Required Meta permissions"]
    },
    current: manualOnly,
    manualFallback: "Publish in Instagram and import metrics manually."
  },
  facebook: {
    id: "facebook",
    contentPlatform: "facebook",
    label: "Facebook Pages",
    official: {
      connectionMethod: "oauth",
      accountTypes: ["Facebook Page with content-management task"],
      operations: {
        list_published_posts: restricted,
        publish: restricted,
        post_metrics: restricted,
        account_metrics: restricted
      },
      requirements: ["Meta app access", "Page access token", "Required Page permissions"]
    },
    current: manualOnly,
    manualFallback: "Publish to a Facebook Page and import metrics manually."
  },
  reddit: {
    id: "reddit",
    contentPlatform: "reddit",
    label: "Reddit",
    official: {
      connectionMethod: "oauth",
      accountTypes: ["Reddit account"],
      operations: {
        list_published_posts: supported,
        publish: supported,
        post_metrics: supported,
        account_metrics: unsupported
      },
      requirements: ["Registered Reddit app", "Requested OAuth scopes", "Subreddit posting rules"]
    },
    current: manualUrlMetrics,
    manualFallback: "Paste a published URL; Finfold can poll score and comment count."
  },
  "product-hunt": {
    id: "product-hunt",
    contentPlatform: "product-hunt",
    label: "Product Hunt",
    official: {
      connectionMethod: "app_token",
      accountTypes: [],
      operations: {
        list_published_posts: unsupported,
        publish: unsupported,
        post_metrics: supported,
        account_metrics: unsupported
      },
      requirements: ["Read-only developer token for public post data"]
    },
    current: manualUrlMetrics,
    manualFallback: "Submit launches in Product Hunt and paste the launch URL for public metrics."
  },
  threads: {
    id: "threads",
    contentPlatform: "threads",
    label: "Threads",
    official: {
      connectionMethod: "oauth",
      accountTypes: ["Threads account"],
      operations: {
        list_published_posts: supported,
        publish: supported,
        post_metrics: supported,
        account_metrics: supported
      },
      requirements: ["Meta app access", "Threads permissions"]
    },
    current: manualOnly,
    manualFallback: "Publish in Threads and import metrics manually."
  },
  "hacker-news": {
    id: "hacker-news",
    contentPlatform: "hacker-news",
    label: "Hacker News",
    official: {
      connectionMethod: "none",
      accountTypes: [],
      operations: {
        list_published_posts: supported,
        publish: unsupported,
        post_metrics: supported,
        account_metrics: unsupported
      },
      requirements: ["Official API is public and read-only"]
    },
    current: manualUrlMetrics,
    manualFallback: "Submit in Hacker News and paste the item URL for score and comment metrics."
  },
  "indie-hackers": {
    id: "indie-hackers",
    contentPlatform: "indie-hackers",
    label: "Indie Hackers",
    official: {
      connectionMethod: "none",
      accountTypes: [],
      operations: {
        list_published_posts: unsupported,
        publish: unsupported,
        post_metrics: unsupported,
        account_metrics: unsupported
      },
      requirements: ["No public creator API"]
    },
    current: manualOnly,
    manualFallback: "Publish in Indie Hackers and record outcomes manually."
  },
  medium: {
    id: "medium",
    contentPlatform: "medium-substack",
    label: "Medium",
    official: {
      connectionMethod: "none",
      accountTypes: [],
      operations: {
        list_published_posts: unsupported,
        publish: unsupported,
        post_metrics: unsupported,
        account_metrics: unsupported
      },
      requirements: ["Medium does not accept new API integrations"]
    },
    current: manualOnly,
    manualFallback: "Publish in Medium and record outcomes manually."
  },
  substack: {
    id: "substack",
    contentPlatform: "medium-substack",
    label: "Substack",
    official: {
      connectionMethod: "none",
      accountTypes: [],
      operations: {
        list_published_posts: unsupported,
        publish: unsupported,
        post_metrics: unsupported,
        account_metrics: unsupported
      },
      requirements: ["No public self-service creator API"]
    },
    current: manualOnly,
    manualFallback: "Publish in Substack and record outcomes manually."
  }
};

export function getSocialConnectorCapabilities(platform: PlatformId): readonly SocialPlatformCapability[] {
  return Object.values(socialPlatformCapabilities).filter((capability) => capability.contentPlatform === platform);
}

export function getSocialConnectorCapability(id: SocialConnectorId): SocialPlatformCapability {
  return socialPlatformCapabilities[id];
}
