import { createSupabaseAdminClient } from "@/lib/supabase";
import { captureServerEvent } from "@/lib/posthog-server";
import { sendReferralRewardEmail } from "@/lib/referral-email";
import {
  maskReferralFriend,
  REFERRAL_COOKIE,
  REFERRAL_REWARD_CREDITS,
  REFERRAL_REWARD_LIMIT,
  type ReferralStatus,
  type ReferralSummary
} from "@/lib/referral-shared";

export {
  REFERRAL_COOKIE,
  REFERRAL_COOKIE_MAX_AGE,
  REFERRAL_REWARD_CREDITS,
  REFERRAL_REWARD_DAYS,
  REFERRAL_REWARD_LIMIT
} from "@/lib/referral-shared";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

type CompletionResult = {
  completed?: boolean;
  reason?: string;
  referral_id?: string;
  referrer_user_id?: string;
  referred_credits?: number;
  referrer_credits?: number;
  expires_at?: string;
};

export function generateReferralCode(length = 10): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
}

export function isNewReferralAccount(createdAt: string | undefined, now = Date.now()): boolean {
  if (!createdAt) return false;
  const created = Date.parse(createdAt);
  return Number.isFinite(created) && created <= now + 60_000 && now - created <= 15 * 60_000;
}

export function readReferralCode(request: Request): string | undefined {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${REFERRAL_COOKIE}=([A-Za-z0-9_-]{8,16})`));
  return match?.[1];
}

export async function hashReferralIp(request: Request): Promise<string | null> {
  const raw =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null;
  if (!raw) return null;
  const salt = process.env.REFERRAL_RISK_SALT ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!salt) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${raw}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function browserFamily(userAgent: string | null): string | null {
  if (!userAgent) return null;
  if (/Edg\//.test(userAgent)) return "edge";
  if (/Firefox\//.test(userAgent)) return "firefox";
  if (/Chrome\//.test(userAgent)) return "chrome";
  if (/Safari\//.test(userAgent)) return "safari";
  return "other";
}

export async function ensureReferralCode(userId: string): Promise<string> {
  const admin = createSupabaseAdminClient();
  if (!admin) throw new Error("Referral system unavailable.");

  const existing = await admin
    .from("referral_codes")
    .select("code")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing.data?.code) return String(existing.data.code);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const code = generateReferralCode();
    const { data, error } = await admin
      .from("referral_codes")
      .insert({ user_id: userId, code })
      .select("code")
      .single();
    if (!error && data?.code) return String(data.code);
    if (error?.code !== "23505") throw new Error("Could not create referral code.");

    const winner = await admin
      .from("referral_codes")
      .select("code")
      .eq("user_id", userId)
      .maybeSingle();
    if (winner.data?.code) return String(winner.data.code);
  }
  throw new Error("Could not create referral code.");
}

export async function isValidReferralCode(code: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{8,16}$/.test(code)) return false;
  const admin = createSupabaseAdminClient();
  if (!admin) return false;
  const { data } = await admin.from("referral_codes").select("id").eq("code", code).maybeSingle();
  return Boolean(data?.id);
}

export async function attributeReferral(params: {
  code: string | undefined;
  referredUserId: string;
  userCreatedAt: string | undefined;
  request: Request;
}): Promise<"attributed" | "ignored" | "ineligible"> {
  const { code, referredUserId, userCreatedAt, request } = params;
  if (!code || !isNewReferralAccount(userCreatedAt)) return "ignored";

  const admin = createSupabaseAdminClient();
  if (!admin) return "ignored";

  const { data: referralCode } = await admin
    .from("referral_codes")
    .select("id, user_id")
    .eq("code", code)
    .maybeSingle();
  if (!referralCode || referralCode.user_id === referredUserId) return "ineligible";

  const ipHash = await hashReferralIp(request);
  let riskFlag = false;
  let riskReason: string | null = null;
  if (ipHash) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("referrals")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("created_at", since);
    if ((count ?? 0) >= 3) {
      riskFlag = true;
      riskReason = "same_ip_velocity";
    }
  }

  const { error } = await admin.from("referrals").insert({
    referral_code_id: referralCode.id,
    referrer_user_id: referralCode.user_id,
    referred_user_id: referredUserId,
    ip_hash: ipHash,
    risk_flag: riskFlag,
    risk_reason: riskReason,
    metadata: { browserFamily: browserFamily(request.headers.get("user-agent")) }
  });

  if (error?.code === "23505") return "ignored";
  if (error) {
    console.error("[referrals] attribution failed:", JSON.stringify(error));
    return "ignored";
  }

  await captureServerEvent(referredUserId, "referral_signup_attributed", {
    referrerUserId: referralCode.user_id,
    riskFlag
  });
  return "attributed";
}

export async function completeReferralForKit(
  referredUserId: string,
  kitId: string
): Promise<CompletionResult | null> {
  const admin = createSupabaseAdminClient();
  if (!admin) return null;

  const { data, error } = await admin.rpc("complete_referral_reward", {
    p_referred_user_id: referredUserId,
    p_kit_id: kitId
  });
  if (error) {
    console.error("[referrals] completion failed:", JSON.stringify(error));
    return null;
  }

  const result = (data ?? {}) as CompletionResult;
  if (!result.completed) return result;

  await captureServerEvent(referredUserId, "referral_reward_granted", {
    referralId: result.referral_id,
    role: "referred",
    credits: result.referred_credits ?? REFERRAL_REWARD_CREDITS
  });

  if (result.referrer_user_id && (result.referrer_credits ?? 0) > 0) {
    await captureServerEvent(result.referrer_user_id, "referral_reward_granted", {
      referralId: result.referral_id,
      role: "referrer",
      credits: result.referrer_credits
    });

    const { data: profile } = await admin
      .from("profiles")
      .select("email, locale")
      .eq("id", result.referrer_user_id)
      .maybeSingle();
    if (profile?.email) {
      await sendReferralRewardEmail({
        to: String(profile.email),
        locale: profile.locale === "en" ? "en" : "zh",
        credits: Number(result.referrer_credits)
      });
    }
  }

  return result;
}

export async function getReferralSummary(userId: string, appUrl: string): Promise<ReferralSummary> {
  const admin = createSupabaseAdminClient();
  if (!admin) throw new Error("Referral system unavailable.");
  const code = await ensureReferralCode(userId);

  const { data, error } = await admin
    .from("referrals")
    .select("id, referred_user_id, status, attributed_at, rewarded_at, referrer_reward_credits")
    .eq("referrer_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error("Could not load referrals.");

  const referrals = (data ?? []).map((row) => ({
    id: String(row.id),
    friendLabel: maskReferralFriend(String(row.referred_user_id)),
    status: row.status as ReferralStatus,
    attributedAt: String(row.attributed_at),
    rewardedAt: row.rewarded_at ? String(row.rewarded_at) : null,
    referrerRewardCredits: Number(row.referrer_reward_credits ?? 0)
  }));
  const completedCount = referrals.filter(
    (row) => row.status === "completed" && row.referrerRewardCredits > 0
  ).length;

  return {
    code,
    inviteUrl: `${appUrl.replace(/\/$/, "")}/r/${code}`,
    completedCount,
    pendingCount: referrals.filter((row) => row.status === "pending").length,
    earnedCredits: referrals
      .filter((row) => row.status === "completed")
      .reduce((sum, row) => sum + row.referrerRewardCredits, 0),
    rewardLimit: REFERRAL_REWARD_LIMIT,
    rewardCredits: REFERRAL_REWARD_CREDITS,
    referrals
  };
}

export async function getIncomingReferral(userId: string): Promise<{
  status: ReferralStatus;
  rewardCredits: number;
  rewardedAt: string | null;
} | null> {
  const admin = createSupabaseAdminClient();
  if (!admin) return null;
  const { data } = await admin
    .from("referrals")
    .select("status, referred_reward_credits, rewarded_at")
    .eq("referred_user_id", userId)
    .maybeSingle();
  if (!data) return null;
  return {
    status: data.status as ReferralStatus,
    rewardCredits: Number(data.referred_reward_credits ?? REFERRAL_REWARD_CREDITS),
    rewardedAt: data.rewarded_at ? String(data.rewarded_at) : null
  };
}
