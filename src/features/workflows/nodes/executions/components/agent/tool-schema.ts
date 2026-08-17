import { z } from "zod";
import type { AiToolParameter } from "../../lib/ai-tool";

function zodTypeFor(type: AiToolParameter["type"]): z.ZodTypeAny {
  switch (type) {
    case "number":
      return z.number();
    case "boolean":
      return z.boolean();
    default:
      return z.string();
  }
}

/**
 * Builds the zod input schema the AI SDK uses to validate/generate a tool
 * call's arguments, from a tool node's configured AI-tool parameter list.
 * Every parameter is required — no optional/default-valued parameters in
 * this first version (see the plan's Global Constraints).
 */
export function buildToolInputSchema(parameters: AiToolParameter[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const parameter of parameters) {
    shape[parameter.name] = zodTypeFor(parameter.type).describe(parameter.description);
  }
  return z.object(shape);
}
