import { redirect } from "next/navigation";

export default function ResearchCenterPage() {
  redirect("/dashboard?intent=research");
}
