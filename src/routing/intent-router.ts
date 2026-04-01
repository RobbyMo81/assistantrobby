import type { MessageRole, RoutableMessageRole } from "../config/types.agent-defaults.js";
// Intent classification by explicit prefix, then keyword heuristic
import type { OpenClawConfig } from "../config/types.openclaw.js";

const PREFIX_MAP: [RegExp, MessageRole][] = [
  [/^\/(plan|think|arch)\b/i, "planning"],
  [/^\/(review|code)\b/i, "codeReview"],
  [/^\/(deep|research)\b/i, "longTask"],
  [/^\/(search|web|browse)\b/i, "webSearch"],
];

const KEYWORD_MAP: [RegExp, MessageRole][] = [
  [/\b(architect|design a system|create a plan|planning)\b/i, "planning"],
  [/\b(review (this|my) code|refactor|code review)\b/i, "codeReview"],
  [/\b(comprehensive (analysis|research)|deep dive|in.depth)\b/i, "longTask"],
  [/\b(search the web|find online|browse|web search)\b/i, "webSearch"],
];

export function classifyMessageIntent(message: string): MessageRole {
  const text = message.trim();
  for (const [rx, role] of PREFIX_MAP) {
    if (rx.test(text)) {
      return role;
    }
  }
  for (const [rx, role] of KEYWORD_MAP) {
    if (rx.test(text)) {
      return role;
    }
  }
  return "chat";
}

export function resolveIntentAgentId(
  role: RoutableMessageRole,
  cfg: OpenClawConfig,
): string | undefined {
  return cfg.agents?.defaults?.roleAgents?.[role];
}
