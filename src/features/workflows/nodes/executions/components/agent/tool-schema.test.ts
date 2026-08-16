import { describe, expect, test } from "bun:test";
import { buildToolInputSchema } from "./tool-schema";

describe("buildToolInputSchema", () => {
  test("builds a zod object with one field per parameter", () => {
    const schema = buildToolInputSchema([
      { name: "city", type: "string", description: "The city to look up" },
      { name: "days", type: "number", description: "How many days ahead" },
    ]);

    const result = schema.safeParse({ city: "Austin", days: 3 });
    expect(result.success).toBe(true);
  });

  test("maps each declared type to the matching zod primitive", () => {
    const schema = buildToolInputSchema([
      { name: "a", type: "string", description: "d" },
      { name: "b", type: "number", description: "d" },
      { name: "c", type: "boolean", description: "d" },
    ]);

    expect(schema.safeParse({ a: "x", b: 1, c: true }).success).toBe(true);
    expect(schema.safeParse({ a: 1, b: 1, c: true }).success).toBe(false);
    expect(schema.safeParse({ a: "x", b: "not a number", c: true }).success).toBe(false);
    expect(schema.safeParse({ a: "x", b: 1, c: "not a boolean" }).success).toBe(false);
  });

  test("every parameter is required — missing fields fail validation", () => {
    const schema = buildToolInputSchema([
      { name: "city", type: "string", description: "The city to look up" },
    ]);

    expect(schema.safeParse({}).success).toBe(false);
  });

  test("an empty parameter list produces a schema accepting an empty object", () => {
    const schema = buildToolInputSchema([]);
    expect(schema.safeParse({}).success).toBe(true);
  });
});
