"use client";

import { createAiNode } from "../ai/ai-node";

export const GroqNode = createAiNode({
  providerType: "GROQ",
  providerLabel: "Groq",
  icon: "/groq.svg",
});
