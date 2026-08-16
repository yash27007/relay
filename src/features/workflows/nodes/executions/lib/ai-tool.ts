/**
 * Any node type becomes usable as an Agent's tool by carrying this shape on
 * its `data.aiTool` field, and by declaring itself `toolCapable` on its
 * canvas component (see base-execution-node.tsx). HTTP Request is the only
 * node wired up to this so far (Task 4 of this plan) — the shape itself is
 * generic so future node types opt in without any redesign.
 */
export interface AiToolParameter {
  name: string;
  type: "string" | "number" | "boolean";
  description: string;
}

export interface AiToolConfig {
  description: string;
  parameters: AiToolParameter[];
}
