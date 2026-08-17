"use client";

import { createAiNode } from "../ai/ai-node";

export const AnthropicNode = createAiNode({
  providerType: "ANTHROPIC",
  providerLabel: "Anthropic",
  icon: "/anthropic.svg",
});
