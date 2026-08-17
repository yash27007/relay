import type { AIProviderType } from "@/features/credentials/lib/ai-providers";

export type AgentNodeData = {
  variableName?: string;
  provider?: AIProviderType;
  credentialId?: string;
  model?: string;
  systemPrompt?: string;
  userPrompt?: string;
  /** LLM round-trips before the loop stops. Default 5, hard ceiling 15 — see the plan's Global Constraints. */
  maxSteps?: number;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
};
