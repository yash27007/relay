"use client";

import { createAiNode } from "../ai/ai-node";

export const MistralNode = createAiNode({
  providerType: "MISTRAL",
  providerLabel: "Mistral",
  icon: "/mistral.svg",
});
