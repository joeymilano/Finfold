import { describe, expect, it } from "vitest";
import { localizeSignupError, mapSignupError } from "@/lib/signup-error";

describe("mapSignupError", () => {
  it("keeps confirmation-email rate limits distinct from invalid addresses", () => {
    expect(mapSignupError({
      code: "over_email_send_rate_limit",
      message: "email rate limit exceeded",
    })).toEqual({
      error: "Too many confirmation emails were requested. Please wait a few minutes and try again.",
      status: 429,
      code: "confirmation_email_rate_limited",
    });
  });

  it("renders the rate-limit message in the active auth locale", () => {
    expect(localizeSignupError("confirmation_email_rate_limited", "zh", "fallback"))
      .toBe("确认邮件发送过于频繁，请等待几分钟后重试。");
    expect(localizeSignupError("confirmation_email_rate_limited", "en", "fallback"))
      .toBe("Too many confirmation emails were requested. Please wait a few minutes and try again.");
    expect(localizeSignupError("unknown", "zh", "fallback")).toBe("fallback");
  });

  it("maps genuine email validation failures", () => {
    expect(mapSignupError({ message: "Unable to validate email address: invalid format" })).toEqual({
      error: "Invalid email address.",
      status: 400,
    });
  });

  it("keeps existing-account guidance actionable", () => {
    expect(mapSignupError({ message: "User already registered" })).toEqual({
      error: "This email is already registered. Try logging in instead.",
      status: 409,
    });
  });
});
