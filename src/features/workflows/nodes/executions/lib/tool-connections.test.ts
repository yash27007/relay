import { describe, expect, test } from "bun:test";
import { isToolConnection, toolSourceHandleId, toolTargetHandleId } from "./tool-connections";

describe("tool-connections handle IDs", () => {
  test("toolTargetHandleId builds a stable, node-scoped id", () => {
    expect(toolTargetHandleId("agent-1")).toBe("agent-1-tool-target");
  });

  test("toolSourceHandleId builds a stable, node-scoped id", () => {
    expect(toolSourceHandleId("http-1")).toBe("http-1-tool-source");
  });
});

describe("isToolConnection", () => {
  test("true when toInput ends with -tool-target", () => {
    expect(isToolConnection({ toInput: "agent-1-tool-target" })).toBe(true);
  });

  test("false for a normal flow connection", () => {
    expect(isToolConnection({ toInput: "agent-1-target" })).toBe(false);
  });

  test("false for a branch connection's toInput", () => {
    expect(isToolConnection({ toInput: "main" })).toBe(false);
  });

  test("false when toInput is null", () => {
    expect(isToolConnection({ toInput: null })).toBe(false);
  });
});
