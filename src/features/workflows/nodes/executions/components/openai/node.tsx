"use client";

import { BotIcon } from "lucide-react";
import { createAiNode } from "../ai/ai-node";

export const OpenAiNode = createAiNode({
  providerType: "OPENAI",
  providerLabel: "OpenAI",
  icon: BotIcon,
});
