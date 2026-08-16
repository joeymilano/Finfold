import type { Metadata } from "next";
import { ForAgentsGuide } from "@/components/agents/ForAgentsGuide";
import { brand } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Finfold for Agents — MCP for brand-native content",
  description: "Connect Claude, ChatGPT, or your own agent to Finfold's Brand Memory and platform-specific content engine.",
  alternates: { canonical: "/for-agents" },
  openGraph: {
    title: "Finfold for Agents",
    description: "Give your agent brand context and platform-native content generation.",
    images: [brand.socialImage]
  },
  twitter: {
    card: "summary_large_image",
    title: "Finfold for Agents",
    description: "Give your agent brand context and platform-native content generation.",
    images: [brand.socialImage.url]
  }
};

export default function ForAgentsPage() {
  return <ForAgentsGuide />;
}
