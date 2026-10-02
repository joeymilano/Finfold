// Store-build replacement for src/automation.ts (aliased in vite.config.ts).
// The Chrome Web Store build must not script social sites, so this stub keeps
// the module shape while removing every DOM-automation behavior.
import type { PageAutomationResult, PageAutomationTask } from "../types";

export async function pageAutomationTask(
  task: PageAutomationTask,
  env?: { host?: string }
): Promise<PageAutomationResult> {
  void task; void env;
  throw new Error("Reply automation is not part of the store build.");
}
