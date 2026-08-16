"use client";

import { ZapIcon } from "lucide-react";
import { createAiNode } from "../ai/ai-node";

export const GroqNode = createAiNode({
  providerType: "GROQ",
  providerLabel: "Groq",
  icon: ZapIcon,
});
