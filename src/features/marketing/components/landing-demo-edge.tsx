import {
  BaseEdge,
  type Edge,
  type EdgeProps,
  getBezierPath,
} from "@xyflow/react";

export type LandingDemoEdgeData = { active: boolean };

export type LandingDemoEdgeType = Edge<
  LandingDemoEdgeData,
  "landingDemo"
>;

/**
 * A static grey track (the wiring, always visible) plus an optional
 * primary-colored overlay that pulses while `active` — i.e. while data is
 * flowing from this edge's source node into its target. Built on xyflow's
 * own BaseEdge/getBezierPath rather than a hand-drawn <path>, so the curve
 * geometry matches exactly what the real canvas would draw for two handles
 * at the same height.
 */
export function LandingDemoEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<LandingDemoEdgeType>) {
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const active = data?.active ?? false;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{ stroke: "var(--color-border)", strokeWidth: 2 }}
      />
      {active && (
        <BaseEdge
          id={`${id}-pulse`}
          path={path}
          className="relay-demo-edge-pulse"
          style={{
            stroke: "var(--color-primary)",
            strokeWidth: 2,
            strokeLinecap: "round",
          }}
        />
      )}
    </>
  );
}
