import { config } from "dotenv";
config({ path: ".env.local" });
const { createClient } = await import("@supabase/supabase-js");
const { runXMorningGeneration } = await import("../lib/x-pipeline/generate.js");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false }
}) as never;
const userId = process.argv[2];
const result = await runXMorningGeneration(admin, userId ? { userId } : {});
console.log(JSON.stringify(result, null, 2));
process.exit(0);
