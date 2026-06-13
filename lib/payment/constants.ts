// Plan → Creem Product ID environment variable mapping
// Each plan maps to an env var that holds the Creem product_id (prod_*)

import type { PlanId } from "./types";

/** Maps PlanId → environment variable name for Creem product IDs */
export const CREEM_PRODUCT_ENV_MAP: Record<PlanId, string> = {
  starter: "CREEM_STARTER_PRODUCT_ID",
  creator: "CREEM_CREATOR_PRODUCT_ID",
  pro: "CREEM_PRO_PRODUCT_ID",
  team: "CREEM_TEAM_PRODUCT_ID"
};

/** List of valid paid plan IDs */
export const VALID_PLANS: PlanId[] = ["starter", "creator", "pro", "team"];
