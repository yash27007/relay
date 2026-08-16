"use client";

import { createAiNode } from "../ai/ai-node";

export const GeminiNode = createAiNode({
  providerType: "GEMINI",
  providerLabel: "Gemini",
  icon: "/gemini.svg",
});
