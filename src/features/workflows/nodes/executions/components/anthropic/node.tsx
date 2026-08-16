"use client";

import { SparklesIcon } from "lucide-react";
import { createAiNode } from "../ai/ai-node";

export const AnthropicNode = createAiNode({
  providerType: "ANTHROPIC",
  providerLabel: "Anthropic",
  icon: SparklesIcon,
});
