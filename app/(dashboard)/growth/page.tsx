import { redirect } from "next/navigation";

export default function LegacyGrowthRedirect() {
  redirect("/operations/growth");
}
