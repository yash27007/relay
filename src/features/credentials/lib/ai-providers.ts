export const AI_PROVIDER_TYPES = ["OPENAI", "ANTHROPIC", "GEMINI", "GROQ"] as const;

export type AIProviderType = (typeof AI_PROVIDER_TYPES)[number];

export const AI_PROVIDERS: { type: AIProviderType; label: string }[] = [
  { type: "OPENAI", label: "OpenAI" },
  { type: "ANTHROPIC", label: "Anthropic" },
  { type: "GEMINI", label: "Gemini" },
  { type: "GROQ", label: "Groq" },
];
