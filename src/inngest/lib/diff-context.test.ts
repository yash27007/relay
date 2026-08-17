import { describe, expect, test } from "bun:test";
import { diffContext } from "./diff-context";

describe("diffContext", () => {
  test("returns an empty object when nothing changed", () => {
    expect(diffContext({ a: 1 }, { a: 1 })).toEqual({});
  });

  test("includes a genuinely new key", () => {
    expect(diffContext({ a: 1 }, { a: 1, b: 2 })).toEqual({ b: 2 });
  });

  test("includes a key whose value changed", () => {
    expect(diffContext({ a: 1 }, { a: 2 })).toEqual({ a: 2 });
  });

  test("excludes unchanged keys while including changed ones", () => {
    expect(diffContext({ a: 1, b: "x" }, { a: 1, b: "y" })).toEqual({ b: "y" });
  });

  test("handles nested object values by deep comparison, not reference", () => {
    const before = { httpResponse: { status: 200, data: { id: 1 } } };
    const after = { httpResponse: { status: 200, data: { id: 1 } } };
    expect(diffContext(before, after)).toEqual({});
  });

  test("both empty returns empty", () => {
    expect(diffContext({}, {})).toEqual({});
  });

  test("real executor shape: adding one variableName key", () => {
    const before = {};
    const after = { myHttp: { httpResponse: { status: 200, data: { ok: true } } } };
    expect(diffContext(before, after)).toEqual({
      myHttp: { httpResponse: { status: 200, data: { ok: true } } },
    });
  });
});
