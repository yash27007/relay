"use client";

import {
  type EdgeTypes,
  type NodeTypes,
  ReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import { GlobeIcon, MousePointerIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import "@xyflow/react/dist/style.css";

import type { NodeStatus } from "@/features/workflows/nodes/react-flow/status-indicator";
import {
  LandingDemoEdge,
  type LandingDemoEdgeType,
} from "./landing-demo-edge";
import {
  LandingDemoNode,
  type LandingDemoNodeType,
} from "./landing-demo-node";

const nodeTypes: NodeTypes = { landingDemo: LandingDemoNode };
const edgeTypes: EdgeTypes = { landingDemo: LandingDemoEdge };

const STEPS = [
  { id: "trigger", label: "Trigger", icon: MousePointerIcon },
  { id: "http", label: "HTTP Request", icon: GlobeIcon },
  { id: "gemini", label: "Gemini", icon: "/gemini.svg" },
] as const;

const X_GAP = 210;

// One 6s loop, mirroring the timing the original CSS mock used: each node
// takes its turn "loading" then settles "success", and the edge feeding it
// lights up for that same window. Phases are relative ms from cycle start;
// the first phase resets everything to "initial" so a fresh cycle never
// starts overlapping the tail end of the previous one.
type Phase = {
  atMs: number;
  statuses: readonly NodeStatus[];
  edgesActive: readonly boolean[];
};

const CYCLE_MS = 6000;

const TIMELINE: readonly Phase[] = [
  {
    atMs: 0,
    statuses: ["initial", "initial", "initial"],
    edgesActive: [false, false],
  },
  {
    atMs: 150,
    statuses: ["loading", "initial", "initial"],
    edgesActive: [false, false],
  },
  {
    atMs: 850,
    statuses: ["success", "initial", "initial"],
    edgesActive: [true, false],
  },
  {
    atMs: 2000,
    statuses: ["success", "loading", "initial"],
    edgesActive: [true, false],
  },
  {
    atMs: 2700,
    statuses: ["success", "success", "initial"],
    edgesActive: [false, true],
  },
  {
    atMs: 4000,
    statuses: ["success", "success", "loading"],
    edgesActive: [false, true],
  },
  {
    atMs: 4700,
    statuses: ["success", "success", "success"],
    edgesActive: [false, false],
  },
];

// The settled, no-motion state shown to prefers-reduced-motion users:
// everything already succeeded, wiring visible, nothing pulsing — the same
// "show the finished state, skip the motion" choice hero.tsx and the real
// WorkflowAnimation keyframes already make elsewhere on this page.
const STILL_PHASE: Phase = TIMELINE[TIMELINE.length - 1];

function useReducedMotion() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    const query = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    setReduced(query.matches);
    const onChange = (e: MediaQueryListEvent) =>
      setReduced(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function useDemoTimeline() {
  const reducedMotion = useReducedMotion();
  const [phase, setPhase] = useState<Phase>(STILL_PHASE);
  const timeouts = useRef<number[]>([]);

  useEffect(() => {
    if (reducedMotion) {
      setPhase(STILL_PHASE);
      return;
    }

    const runCycle = () => {
      timeouts.current.forEach(clearTimeout);
      timeouts.current = TIMELINE.map((step) =>
        window.setTimeout(() => setPhase(step), step.atMs),
      );
    };

    runCycle();
    const interval = window.setInterval(runCycle, CYCLE_MS);

    return () => {
      timeouts.current.forEach(clearTimeout);
      window.clearInterval(interval);
    };
  }, [reducedMotion]);

  return phase;
}

/**
 * A looping diagram of a workflow executing, rendered by the app's real
 * xyflow canvas — nodes are BaseNode/BaseHandle, statuses drive the same
 * loading/success visuals a live run produces, edges are xyflow's own
 * bezier path helper. Read-only: dragging, connecting, and scroll/pinch
 * zoom are all disabled, this is a demo playing on loop, not an editor.
 */
export function WorkflowAnimation() {
  const phase = useDemoTimeline();

  const nodes: LandingDemoNodeType[] = useMemo(
    () =>
      STEPS.map((step, index) => ({
        id: step.id,
        type: "landingDemo",
        position: { x: index * X_GAP, y: 0 },
        draggable: false,
        selectable: false,
        connectable: false,
        focusable: false,
        data: {
          label: step.label,
          icon: step.icon,
          status: phase.statuses[index],
          showTarget: index > 0,
          showSource: index < STEPS.length - 1,
        },
      })),
    [phase],
  );

  const edges: LandingDemoEdgeType[] = useMemo(
    () =>
      STEPS.slice(0, -1).map((step, index) => ({
        id: `${step.id}-${STEPS[index + 1].id}`,
        source: step.id,
        target: STEPS[index + 1].id,
        type: "landingDemo",
        selectable: false,
        focusable: false,
        data: { active: phase.edgesActive[index] },
      })),
    [phase],
  );

  return (
    <div className="h-44 w-full" aria-hidden="true">
      <style>{`
        .relay-demo-edge-pulse {
          stroke-dasharray: 8 6;
          animation: relay-demo-edge-flow 0.6s linear infinite;
        }
        @keyframes relay-demo-edge-flow {
          to { stroke-dashoffset: -14; }
        }
      `}</style>
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.25 }}
          proOptions={{ hideAttribution: true }}
          nodesDraggable={false}
          nodesConnectable={false}
          nodesFocusable={false}
          edgesFocusable={false}
          elementsSelectable={false}
          panOnDrag={false}
          panOnScroll={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          preventScrolling={false}
        />
      </ReactFlowProvider>
    </div>
  );
}
