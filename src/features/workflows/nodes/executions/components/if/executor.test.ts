import { describe, expect, test } from "bun:test";
import { NonRetriableError } from "inngest";
import { IfExecutor } from "./executor";

const fakeStep = {
  run: async <T>(_name: string, fn: () => Promise<T>) => fn(),
} as unknown as Parameters<typeof IfExecutor>[0]["step"];

function run(
  data: Parameters<typeof IfExecutor>[0]["data"],
  context: Record<string, unknown> = {},
) {
  return IfExecutor({ nodeId: "if-1", context, data, step: fakeStep, userId: "test-user" });
}

describe("IfExecutor", () => {
  test("equals: true when values match", async () => {
    const result = await run(
      { value: "{{status}}", operator: "equals", compareValue: "active" },
      { status: "active" },
    );
    expect(result.branch).toBe("true");
  });

  test("equals: false when values differ", async () => {
    const result = await run(
      { value: "{{status}}", operator: "equals", compareValue: "active" },
      { status: "inactive" },
    );
    expect(result.branch).toBe("false");
  });

  test("notEquals", async () => {
    const result = await run(
      { value: "{{status}}", operator: "notEquals", compareValue: "active" },
      { status: "inactive" },
    );
    expect(result.branch).toBe("true");
  });

  test("contains", async () => {
    const result = await run(
      { value: "{{message}}", operator: "contains", compareValue: "error" },
      { message: "an error occurred" },
    );
    expect(result.branch).toBe("true");
  });

  test("notContains", async () => {
    const result = await run(
      { value: "{{message}}", operator: "notContains", compareValue: "error" },
      { message: "all good" },
    );
    expect(result.branch).toBe("true");
  });

  test("startsWith", async () => {
    const result = await run(
      { value: "{{name}}", operator: "startsWith", compareValue: "Ada" },
      { name: "Ada Lovelace" },
    );
    expect(result.branch).toBe("true");
  });

  test("endsWith", async () => {
    const result = await run(
      { value: "{{name}}", operator: "endsWith", compareValue: "Lovelace" },
      { name: "Ada Lovelace" },
    );
    expect(result.branch).toBe("true");
  });

  test("greaterThan", async () => {
    const result = await run(
      { value: "{{count}}", operator: "greaterThan", compareValue: "5" },
      { count: 10 },
    );
    expect(result.branch).toBe("true");
  });

  test("lessThan", async () => {
    const result = await run(
      { value: "{{count}}", operator: "lessThan", compareValue: "5" },
      { count: 10 },
    );
    expect(result.branch).toBe("false");
  });

  test("greaterThan throws when values are not numeric", async () => {
    await expect(
      run(
        { value: "{{name}}", operator: "greaterThan", compareValue: "5" },
        { name: "Ada" },
      ),
    ).rejects.toThrow(NonRetriableError);
  });

  test("isEmpty: true when resolved value is an empty string", async () => {
    const result = await run({ value: "{{name}}", operator: "isEmpty" }, { name: "" });
    expect(result.branch).toBe("true");
  });

  test("isNotEmpty: true when resolved value is non-empty", async () => {
    const result = await run({ value: "{{name}}", operator: "isNotEmpty" }, { name: "Ada" });
    expect(result.branch).toBe("true");
  });

  test("throws when value cannot be resolved", async () => {
    await expect(run({ value: "{{missing}}", operator: "isEmpty" }, {})).rejects.toThrow(
      NonRetriableError,
    );
  });

  test("throws when compareValue is missing for an operator that needs it", async () => {
    await expect(
      run({ value: "{{status}}", operator: "equals" }, { status: "active" }),
    ).rejects.toThrow(NonRetriableError);
  });

  test("throws when compareValue cannot be resolved", async () => {
    await expect(
      run(
        { value: "{{status}}", operator: "equals", compareValue: "{{missing}}" },
        { status: "active" },
      ),
    ).rejects.toThrow(NonRetriableError);
  });
});
