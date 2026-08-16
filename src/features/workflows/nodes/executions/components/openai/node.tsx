"use client";

import { createAiNode } from "../ai/ai-node";

export const OpenAiNode = createAiNode({
  providerType: "OPENAI",
  providerLabel: "OpenAI",
  icon: "/openai.svg",
});
