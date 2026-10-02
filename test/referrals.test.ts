import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  maskReferralFriend,
  referralShareCopy,
  REFERRAL_COOKIE_MAX_AGE,
  REFERRAL_REWARD_CREDITS,
  REFERRAL_REWARD_DAYS,
  REFERRAL_REWARD_LIMIT
} from "@/lib/referral-shared";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/046_referrals.sql"),
  "utf8"
);

describe("referral offer", () => {
  it("locks the promised reward, cap, cookie window, and expiry", () => {
    expect(REFERRAL_REWARD_CREDITS).toBe(100);
    expect(REFERRAL_REWARD_LIMIT).toBe(10);
    expect(REFERRAL_REWARD_DAYS).toBe(90);
    expect(REFERRAL_COOKIE_MAX_AGE).toBe(30 * 24 * 60 * 60);
  });

  it("produces complete bilingual share copy with the invite URL", () => {
    const url = "https://www.finfold.app/r/Abc234XY";
    expect(referralShareCopy("zh", url)).toContain("100 创作点数");
    expect(referralShareCopy("zh", url)).not.toContain("Credits");
    expect(referralShareCopy("zh", url)).toContain(url);
    expect(referralShareCopy("en", url)).toContain("first creation");
    expect(referralShareCopy("en", url)).toContain(url);
  });

  it("masks friend identifiers while leaving a stable suffix", () => {
    expect(maskReferralFriend("12345678-90ab-cdef-1234-567890abcdef")).toBe("•••• CDEF");
    expect(maskReferralFriend("")).toBe("•••• NEW");
  });
});

describe("referral reward migration", () => {
  it("allows only one referrer per invited account and blocks self-referrals", () => {
    expect(migration).toMatch(/referred_user_id\s+uuid\s+NOT NULL UNIQUE/);
    expect(migration).toContain("CHECK (referrer_user_id <> referred_user_id)");
  });

  it("serializes completion and grants only after a persisted kit exists", () => {
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("FROM public.content_kits");
    expect(migration).toContain("id = p_kit_id AND user_id = p_referred_user_id");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("TO service_role");
  });

  it("serializes the per-referrer cap and keeps the invited reward outside it", () => {
    expect(migration).toContain("WHERE user_id = v_referral.referrer_user_id");
    expect(migration).toContain("v_referrer_completed_count < 10");
    expect(migration).toContain("The invited creator always receives");
  });

  it("creates 90-day grant batches and auditable referral transactions", () => {
    expect(migration).toContain("interval '90 days'");
    expect(migration).toContain("'referral_reward'");
    expect(migration).toContain("'referral'");
    expect(migration).toContain("'grant'");
  });
});
