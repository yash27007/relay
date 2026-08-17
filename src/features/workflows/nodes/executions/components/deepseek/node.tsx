"use client";

import { createAiNode } from "../ai/ai-node";

export const DeepseekNode = createAiNode({
  providerType: "DEEPSEEK",
  providerLabel: "DeepSeek",
  icon: "/deepseek.svg",
});
