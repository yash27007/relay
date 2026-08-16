import { describe, expect, test } from "bun:test";
import { resolveTemplate } from "./resolve-template";

describe("resolveTemplate", () => {
  test("resolves a nested dot-path", () => {
    const context = { myApiCall: { httpResponse: { data: { status: 200 } } } };
    expect(resolveTemplate("{{myApiCall.httpResponse.data.status}}", context)).toBe(200);
  });

  test("preserves native type for a whole-string single reference", () => {
    const context = { flag: true };
    expect(resolveTemplate("{{flag}}", context)).toBe(true);
  });

  test("returns undefined for a missing path in whole-string mode", () => {
    expect(resolveTemplate("{{missing.path}}", {})).toBeUndefined();
  });

  test("substitutes into surrounding text", () => {
    const context = { userName: "Ada" };
    expect(resolveTemplate("Hello {{userName}}!", context)).toBe("Hello Ada!");
  });

  test("substitutes the literal 'undefined' for a missing path in substitution mode", () => {
    expect(resolveTemplate("Value: {{missing}}", {})).toBe("Value: undefined");
  });

  test("returns a static string unchanged when it has no template references", () => {
    expect(resolveTemplate("https://example.com", {})).toBe("https://example.com");
  });

  test("substitutes multiple references", () => {
    const context = { a: 1, b: 2 };
    expect(resolveTemplate("{{a}}-{{b}}", context)).toBe("1-2");
  });
});
