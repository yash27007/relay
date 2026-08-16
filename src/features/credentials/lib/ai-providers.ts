import { CredentialType } from "@/generated/prisma/enums";

// Derived from the Prisma enum (not hand-copied) so this can't drift if
// CredentialType ever gains/loses a member.
export const AI_PROVIDER_TYPES = Object.values(CredentialType) as [
  CredentialType,
  ...CredentialType[],
];

export type AIProviderType = CredentialType;

export const AI_PROVIDERS: { type: AIProviderType; label: string; icon: string }[] = [
  { type: "OPENAI", label: "OpenAI", icon: "/openai.svg" },
  { type: "ANTHROPIC", label: "Anthropic", icon: "/anthropic.svg" },
  { type: "GEMINI", label: "Gemini", icon: "/gemini.svg" },
  { type: "GROQ", label: "Groq", icon: "/groq.svg" },
  { type: "DEEPSEEK", label: "DeepSeek", icon: "/deepseek.svg" },
  { type: "MISTRAL", label: "Mistral", icon: "/mistral.svg" },
  { type: "MOONSHOT", label: "Moonshot AI (Kimi)", icon: "/moonshot.svg" },
  { type: "OLLAMA", label: "Ollama", icon: "/ollama.svg" },
];
