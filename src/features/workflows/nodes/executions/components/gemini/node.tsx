"use client";

import { GemIcon } from "lucide-react";
import { createAiNode } from "../ai/ai-node";

export const GeminiNode = createAiNode({
  providerType: "GEMINI",
  providerLabel: "Gemini",
  icon: GemIcon,
});
