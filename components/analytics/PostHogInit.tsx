"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuthUser } from "@/components/auth/AuthUserProvider";
import { consumePendingSignupFlow, readPendingSignupFlow } from "@/lib/auth-funnel";
import { captureEvent, clearAnalyticsIdentity, identifyAnalyticsUser, initPostHog } from "@/lib/posthog";

/** Mounted once in the root layout so PostHog captures pageviews across the app. */
export function PostHogInit() {
  const pathname = usePathname();
  const { ready, user } = useAuthUser();

  useEffect(() => {
    initPostHog();
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (user?.id) {
      identifyAnalyticsUser(user);
      const pending = readPendingSignupFlow();
      const isAuthPage = pathname === "/signup" || pathname === "/login";
      if (pending && !isAuthPage) {
        consumePendingSignupFlow();
        const destinationPath = new URL(pending.returnTo, window.location.origin).pathname;
        captureEvent("signup_destination_reached", {
          signup_flow_id: pending.flowId,
          auth_method: pending.authMethod,
          return_to: pending.returnTo,
          reached_path: pathname,
          destination_matches: destinationPath === pathname,
          elapsed_ms: Math.max(0, Date.now() - pending.startedAt)
        });
      }
    } else {
      clearAnalyticsIdentity();
    }
  }, [pathname, ready, user]);

  return null;
}
