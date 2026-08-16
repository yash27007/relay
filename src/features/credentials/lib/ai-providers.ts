import { CredentialType } from "@/generated/prisma/enums";

// Derived from the Prisma enum (not hand-copied) so this can't drift if
// CredentialType ever gains/loses a member.
export const AI_PROVIDER_TYPES = Object.values(CredentialType) as [
  CredentialType,
  ...CredentialType[],
];

export type AIProviderType = CredentialType;

export const AI_PROVIDERS: { type: AIProviderType; label: string }[] = [
  { type: "OPENAI", label: "OpenAI" },
  { type: "ANTHROPIC", label: "Anthropic" },
  { type: "GEMINI", label: "Gemini" },
  { type: "GROQ", label: "Groq" },
];
