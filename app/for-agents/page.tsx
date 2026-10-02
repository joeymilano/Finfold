import type { Metadata } from "next";
import { ForAgentsGuide } from "@/components/agents/ForAgentsGuide";
import { brand } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Finfold for ChatGPT & AI Agents — Brand-native content with MCP",
  description: "Connect Finfold to ChatGPT with OAuth, or use a scoped MCP token with another agent, to create and save brand-native content kits.",
  alternates: { canonical: "/for-agents" },
  openGraph: {
    title: "Finfold for ChatGPT & AI Agents",
    description: "Create and save brand-native, platform-specific content kits from ChatGPT.",
    images: [brand.socialImage]
  },
  twitter: {
    card: "summary_large_image",
    title: "Finfold for ChatGPT & AI Agents",
    description: "Create and save brand-native, platform-specific content kits from ChatGPT.",
    images: [brand.socialImage.url]
  }
};

export default function ForAgentsPage() {
  return <ForAgentsGuide />;
}
