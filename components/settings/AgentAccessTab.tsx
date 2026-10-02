"use client";

import React from "react";
import { McpAccessPanel } from "@/components/app-shell/McpAccessPanel";
import { OutcomeWebhookPanel } from "@/components/app-shell/OutcomeWebhookPanel";

/**
 * AgentAccessTab — MCP token management and the business-result webhook.
 * Both panels manage their own data; this tab only sequences them.
 */
export function AgentAccessTab() {
  return (
    <div className="grid gap-6">
      <McpAccessPanel />
      <OutcomeWebhookPanel />
    </div>
  );
}
