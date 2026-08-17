import type { WorkflowContext } from "../types";

const TEMPLATE_PATTERN = /\{\{\s*([^}]+?)\s*\}\}/g;

function resolvePath(path: string, context: WorkflowContext): unknown {
  const segments = path.split(".").map((segment) => segment.trim());
  let current: unknown = context;
  for (const segment of segments) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/**
 * Resolves `{{path.to.value}}` references against a workflow's execution
 * context.
 *
 * - If `template` is exactly one `{{...}}` reference with no surrounding
 *   text, the resolved value's native type is returned (so a number stays
 *   a number).
 * - Otherwise, every `{{...}}` reference found is stringified and
 *   substituted in place, and a string is always returned.
 * - A reference to a missing path resolves to `undefined` in whole-string
 *   mode, or the literal text "undefined" in substitution mode.
 */
export function resolveTemplate(
  template: string,
  context: WorkflowContext,
): unknown {
  const trimmed = template.trim();
  const matches = [...trimmed.matchAll(TEMPLATE_PATTERN)];

  if (matches.length === 1 && matches[0][0] === trimmed) {
    return resolvePath(matches[0][1], context);
  }

  return template.replace(TEMPLATE_PATTERN, (_match, path: string) =>
    String(resolvePath(path, context)),
  );
}
