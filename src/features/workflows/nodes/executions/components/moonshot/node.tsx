"use client";

import { createAiNode } from "../ai/ai-node";

export const MoonshotNode = createAiNode({
  providerType: "MOONSHOT",
  providerLabel: "Moonshot AI (Kimi)",
  icon: "/moonshot.svg",
});
