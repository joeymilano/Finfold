export type XhsProviderEvidence = {
  provider: string;
  available: boolean;
  accountUrl: string | null;
  capturedAt: string;
  publicProfile?: {
    displayName?: string;
    bio?: string;
    followerCount?: number;
    noteCount?: number;
  };
  referenceNotes?: Array<{
    url: string;
    title?: string;
    publishedAt?: string;
  }>;
  limitation?: string;
};

/**
 * Replaceable boundary for approved public/commercial Xiaohongshu data.
 * Implementations may use a licensed supplier, but must never require creator
 * cookies, simulated login, or reverse-engineered private endpoints.
 */
export interface XhsDataProvider {
  readonly id: string;
  loadAccountEvidence(accountUrl: string): Promise<XhsProviderEvidence>;
}

export class FirstPartyImportXhsDataProvider implements XhsDataProvider {
  readonly id = "first_party_import";

  async loadAccountEvidence(accountUrl: string): Promise<XhsProviderEvidence> {
    return {
      provider: this.id,
      available: true,
      accountUrl,
      capturedAt: new Date().toISOString(),
      limitation: "账号链接仅作为用户提供的账号标识；诊断指标来自创作中心导入。"
    };
  }
}

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

/** Reuses a prior evidence-first account investigation without re-fetching. */
export class PersistedAccountInvestigationXhsDataProvider implements XhsDataProvider {
  readonly id = "account_investigation";

  constructor(
    private readonly admin: AdminClient,
    private readonly userId: string
  ) {}

  async loadAccountEvidence(accountUrl: string): Promise<XhsProviderEvidence> {
    const { data, error } = await this.admin
      .from("account_investigations")
      .select("case_state, confidence, evidence_level, measured_at")
      .eq("user_id", this.userId)
      .eq("platform", "xiaohongshu")
      .eq("account_url", accountUrl)
      .order("measured_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return {
        provider: this.id,
        available: false,
        accountUrl,
        capturedAt: new Date().toISOString(),
        limitation: "没有找到同一账号链接的历史账号调查；不影响第一方导入诊断。"
      };
    }
    return {
      provider: this.id,
      available: true,
      accountUrl,
      capturedAt: String(data.measured_at),
      limitation: [
        `历史账号调查：${String(data.case_state)}`,
        `证据等级 ${String(data.evidence_level)}，置信度 ${String(data.confidence)}`,
        "仅作补充来源，不单独证明处罚、限流或因果关系。"
      ].join("；")
    };
  }
}

export type XhsProviderResolution = {
  primary: XhsProviderEvidence;
  attempts: XhsProviderEvidence[];
  warnings: string[];
};

/**
 * Commercial evidence is additive. A supplier outage can reduce public profile
 * enrichment, but can never block the first-party Creator Center diagnosis.
 */
export async function resolveXhsProviderEvidence(
  accountUrl: string | undefined,
  commercialProvider?: XhsDataProvider | null,
  firstPartyProvider: XhsDataProvider = new FirstPartyImportXhsDataProvider()
): Promise<XhsProviderResolution> {
  const normalizedUrl = accountUrl?.trim() ?? "";
  const attempts: XhsProviderEvidence[] = [];
  const warnings: string[] = [];

  if (normalizedUrl && commercialProvider) {
    try {
      attempts.push(await commercialProvider.loadAccountEvidence(normalizedUrl));
    } catch (error) {
      const message = error instanceof Error ? error.message : "供应商暂时不可用";
      attempts.push({
        provider: commercialProvider.id,
        available: false,
        accountUrl: normalizedUrl,
        capturedAt: new Date().toISOString(),
        limitation: message
      });
      warnings.push(`商业数据源 ${commercialProvider.id} 不可用：${message}`);
    }
  }

  const primary = await firstPartyProvider.loadAccountEvidence(normalizedUrl);
  attempts.push(primary);
  return { primary, attempts, warnings };
}
import type { createSupabaseAdminClient } from "@/lib/supabase";
