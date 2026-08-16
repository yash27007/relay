import { describe, expect, test } from "bun:test";
import { NonRetriableError } from "inngest";
import { SwitchExecutor } from "./executor";

const fakeStep = {
  run: async <T>(_name: string, fn: () => Promise<T>) => fn(),
} as unknown as Parameters<typeof SwitchExecutor>[0]["step"];

function run(
  data: Parameters<typeof SwitchExecutor>[0]["data"],
  context: Record<string, unknown> = {},
) {
  return SwitchExecutor({
    nodeId: "switch-1",
    context,
    data,
    step: fakeStep,
    userId: "test-user",
  });
}

describe("SwitchExecutor", () => {
  test("routes to the first matching case", async () => {
    const result = await run(
      {
        value: "{{status}}",
        cases: [
          { id: "a", value: "pending" },
          { id: "b", value: "active" },
        ],
      },
      { status: "active" },
    );
    expect(result.branch).toBe("b");
  });

  test("routes to default when no case matches", async () => {
    const result = await run(
      {
        value: "{{status}}",
        cases: [{ id: "a", value: "pending" }],
      },
      { status: "archived" },
    );
    expect(result.branch).toBe("default");
  });

  test("routes to default when no cases are configured", async () => {
    const result = await run({ value: "{{status}}", cases: [] }, { status: "active" });
    expect(result.branch).toBe("default");
  });

  test("matches using template-resolved case values", async () => {
    const result = await run(
      {
        value: "{{status}}",
        cases: [{ id: "a", value: "{{expectedStatus}}" }],
      },
      { status: "active", expectedStatus: "active" },
    );
    expect(result.branch).toBe("a");
  });

  test("compares numeric and string-typed values by their string form", async () => {
    const result = await run(
      {
        value: "{{count}}",
        cases: [{ id: "a", value: "5" }],
      },
      { count: 5 },
    );
    expect(result.branch).toBe("a");
  });

  test("first matching case wins when multiple cases share a value", async () => {
    const result = await run(
      {
        value: "{{status}}",
        cases: [
          { id: "first", value: "active" },
          { id: "second", value: "active" },
        ],
      },
      { status: "active" },
    );
    expect(result.branch).toBe("first");
  });

  test("throws when value is missing", async () => {
    await expect(run({ cases: [] }, {})).rejects.toThrow(NonRetriableError);
  });

  test("throws when value cannot be resolved", async () => {
    await expect(run({ value: "{{missing}}", cases: [] }, {})).rejects.toThrow(
      NonRetriableError,
    );
  });

  test("treats an unresolvable case value as never matching, not an error", async () => {
    const result = await run(
      {
        value: "{{status}}",
        cases: [{ id: "a", value: "{{missing}}" }],
      },
      { status: "active" },
    );
    expect(result.branch).toBe("default");
  });
});
