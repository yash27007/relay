// NOTE: the brief assumed a `createMoonshot` export (following this
// codebase's `create<Provider>` convention), but the installed
// @ai-sdk/moonshotai package actually exports `createMoonshotAI` — see
// node_modules/@ai-sdk/moonshotai/dist/index.d.ts.
import { createMoonshotAI } from "@ai-sdk/moonshotai";
import { createAiExecutor } from "../ai/create-ai-executor";

export const MoonshotExecutor = createAiExecutor({
  providerType: "MOONSHOT",
  providerLabel: "Moonshot AI (Kimi)",
  defaultModel: "kimi-k2-0711-preview",
  createModel: (apiKey, model) => createMoonshotAI({ apiKey })(model),
});
