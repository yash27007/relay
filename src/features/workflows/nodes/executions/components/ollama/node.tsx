"use client";

import { createAiNode } from "../ai/ai-node";

export const OllamaNode = createAiNode({
  providerType: "OLLAMA",
  providerLabel: "Ollama",
  icon: "/ollama.svg",
});
