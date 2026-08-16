import { NonRetriableError } from "inngest";
import { NodeExecutor } from "../../../executions/types";
import { resolveTemplate } from "../../lib/resolve-template";

export const IF_OPERATORS = [
  "equals",
  "notEquals",
  "contains",
  "notContains",
  "startsWith",
  "endsWith",
  "greaterThan",
  "lessThan",
  "isEmpty",
  "isNotEmpty",
] as const;

export type IfOperator = (typeof IF_OPERATORS)[number];

type IfData = {
  value?: string;
  operator?: IfOperator;
  compareValue?: string;
};

export const OPERATORS_WITHOUT_COMPARE_VALUE = new Set<IfOperator>(["isEmpty", "isNotEmpty"]);

function evaluate(operator: IfOperator, value: unknown, compareValue: unknown): boolean {
  switch (operator) {
    case "isEmpty":
      return value === undefined || value === null || value === "";
    case "isNotEmpty":
      return !(value === undefined || value === null || value === "");
    case "equals":
      return String(value) === String(compareValue);
    case "notEquals":
      return String(value) !== String(compareValue);
    case "contains":
      return String(value).includes(String(compareValue));
    case "notContains":
      return !String(value).includes(String(compareValue));
    case "startsWith":
      return String(value).startsWith(String(compareValue));
    case "endsWith":
      return String(value).endsWith(String(compareValue));
    case "greaterThan":
    case "lessThan": {
      const left = Number(value);
      const right = Number(compareValue);
      if (Number.isNaN(left) || Number.isNaN(right)) {
        throw new NonRetriableError(
          "IF node: value and compare value must both be numeric for this operator",
        );
      }
      return operator === "greaterThan" ? left > right : left < right;
    }
    default:
      throw new NonRetriableError(`IF node: unsupported operator "${operator}"`);
  }
}

export const IfExecutor: NodeExecutor<IfData> = async ({ nodeId, context, data, step }) => {
  if (!data.value) {
    throw new NonRetriableError("IF node: value is required");
  }
  if (!data.operator) {
    throw new NonRetriableError("IF node: operator is required");
  }

  const resolvedValue = resolveTemplate(data.value, context);
  if (resolvedValue === undefined) {
    throw new NonRetriableError("IF node: value could not be resolved");
  }

  const needsCompareValue = !OPERATORS_WITHOUT_COMPARE_VALUE.has(data.operator);
  let resolvedCompareValue: unknown;
  if (needsCompareValue) {
    if (!data.compareValue) {
      throw new NonRetriableError("IF node: compare value is required for this operator");
    }
    resolvedCompareValue = resolveTemplate(data.compareValue, context);
    if (resolvedCompareValue === undefined) {
      throw new NonRetriableError("IF node: compare value could not be resolved");
    }
  }

  const branch = await step.run(`if-${nodeId}`, async () =>
    evaluate(data.operator as IfOperator, resolvedValue, resolvedCompareValue) ? "true" : "false",
  );

  return { context, branch };
};
