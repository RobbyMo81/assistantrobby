import { describe, expect, it } from "vitest";
import { classifyMessageIntent, resolveIntentAgentId } from "./intent-router.js";

describe("intent router", () => {
  it("classifies supported slash prefixes", () => {
    expect(classifyMessageIntent("/plan draft the approach")).toBe("planning");
    expect(classifyMessageIntent("/review this diff")).toBe("codeReview");
    expect(classifyMessageIntent("/research this topic")).toBe("longTask");
    expect(classifyMessageIntent("/browse current docs")).toBe("webSearch");
  });

  it("classifies supported keyword heuristics and falls back to chat", () => {
    expect(classifyMessageIntent("Please do a code review on this patch")).toBe("codeReview");
    expect(classifyMessageIntent("Need a comprehensive research summary")).toBe("longTask");
    expect(classifyMessageIntent("Search the web for current release notes")).toBe("webSearch");
    expect(classifyMessageIntent("hello there")).toBe("chat");
  });

  it("resolves routable roles from config", () => {
    const cfg = {
      agents: {
        defaults: {
          roleAgents: {
            planning: "planner",
            codeReview: "reviewer",
            longTask: "researcher",
            webSearch: "web-agent",
          },
        },
      },
    };

    expect(resolveIntentAgentId("planning", cfg)).toBe("planner");
    expect(resolveIntentAgentId("webSearch", cfg)).toBe("web-agent");
  });
});
