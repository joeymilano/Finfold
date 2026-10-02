import { STORE_BUILD } from "./flags";

// The reply pilot platforms, declared in manifest optional_host_permissions:
// Chrome (137+) no longer grants host access at install time, so the side
// panel offers a one-click chrome.permissions.request() instead of sending
// users to chrome://extensions or a toolbar-icon tap per tab. The store build
// ships the reply assistant as inert stubs and declares none of these origins.
export const PILOT_ORIGINS = STORE_BUILD
  ? []
  : ["https://xiaohongshu.com/*", "https://*.xiaohongshu.com/*", "https://linkedin.com/*", "https://*.linkedin.com/*", "https://x.com/*", "https://*.x.com/*", "https://twitter.com/*", "https://*.twitter.com/*"];

/** Must be called from a user gesture (button click in the side panel). */
export async function requestPilotOrigins(): Promise<boolean> {
  if (PILOT_ORIGINS.length === 0) return false;
  try {
    return await chrome.permissions.request({ origins: PILOT_ORIGINS });
  } catch {
    return false;
  }
}
