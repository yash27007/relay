import type { WorkflowContext } from "@/features/workflows/nodes/executions/types";

/**
 * Returns only the top-level keys of `after` that are new or whose value
 * differs from `before` — a generic, executor-agnostic way to capture
 * "what did this node actually produce." Every existing executor spreads
 * `...context` and adds exactly one new key (`{ [variableName]: value }`),
 * so this reduces to exactly that key for every node type today, without
 * this function needing to know anything about which executor ran.
 *
 * Compares by JSON-serialized value, not reference: executors always
 * return a fresh context object (`{ ...context, ... }`), so reference
 * equality would treat every key as "changed" even when its value is
 * identical.
 */
export function diffContext(
  before: WorkflowContext,
  after: WorkflowContext,
): WorkflowContext {
  const diff: WorkflowContext = {};
  for (const key of Object.keys(after)) {
    if (!(key in before) || JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      diff[key] = after[key];
    }
  }
  return diff;
}
