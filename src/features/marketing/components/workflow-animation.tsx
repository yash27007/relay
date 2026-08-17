"use client";

import { GlobeIcon, MousePointerIcon } from "lucide-react";
import { NodeIcon } from "@/features/workflows/nodes/node-icon";

const STEPS = [
  { label: "Trigger", icon: MousePointerIcon, delay: "0s" },
  { label: "HTTP Request", icon: GlobeIcon, delay: "2s" },
  { label: "Gemini", icon: "/gemini.svg", delay: "4s" },
] as const;

const LINE_DELAYS = ["0.5s", "2.5s"] as const;

/**
 * A looping diagram of a workflow executing, built from the same visual
 * primitives the real editor uses — not an abstract illustration. Node
 * cards share BaseNode's `rounded-md` radius and get the same left/right
 * handle dots BaseHandle renders; connectors are SVG paths with rounded
 * end-caps rather than plain <line>s, drawn with the same horizontal-
 * tangent geometry @xyflow/react's default bezier edge computes — which,
 * for two handles at the same height (as here), correctly resolves to a
 * straight line, exactly like the real canvas renders this layout. The
 * pulse that travels along each connector, and the ring each node glows
 * with, echo the same loading/success visual language the editor uses
 * for live execution — looping here for show instead of reporting a
 * real run.
 *
 * Pure CSS/SVG, no client JS, no animation library. Every animated
 * element shares one 6s duration + infinite iteration; each element's
 * own animation-delay is what staggers it within that shared cycle, so
 * the whole diagram stays in sync loop after loop:
 *   t=0.0s  node 0 (Trigger) glows
 *   t=0.5s  line 0->1 pulse travels (~1.3s)
 *   t=2.0s  node 1 (HTTP Request) glows
 *   t=2.5s  line 1->2 pulse travels (~1.3s)
 *   t=4.0s  node 2 (Gemini) glows
 *   t=4.4s..6.0s  pause, then the 6s cycle repeats
 */
export function WorkflowAnimation() {
  return (
    <div className="w-full">
      <style>{`
        @keyframes relay-node-glow {
          0%, 8%, 100% { box-shadow: 0 0 0 0 transparent; border-color: var(--color-border); }
          4% { box-shadow: 0 0 0 6px color-mix(in oklab, var(--color-primary) 25%, transparent); border-color: var(--color-primary); }
        }
        @keyframes relay-line-flow {
          0%, 100% { stroke-dashoffset: 60; opacity: 0; }
          2% { opacity: 1; }
          22% { stroke-dashoffset: -60; opacity: 1; }
          24% { opacity: 0; }
        }
        .relay-node { animation: relay-node-glow 6s ease-in-out infinite; }
        .relay-line { animation: relay-line-flow 6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .relay-node, .relay-line { animation: none; }
          .relay-node { border-color: var(--color-primary); }
          .relay-line { opacity: 0; }
        }
      `}</style>
      <div className="flex items-center">
        {STEPS.map((stepItem, index) => (
          <div
            key={stepItem.label}
            className="flex flex-1 items-center last:flex-none"
          >
            <div
              className="relay-node relative flex shrink-0 flex-col items-center gap-2 rounded-md border bg-card p-4"
              style={{ animationDelay: stepItem.delay }}
            >
              {index > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute top-1/2 -left-[5px] size-[9px] -translate-y-1/2 rounded-full border bg-muted dark:bg-secondary"
                />
              )}
              <NodeIcon
                icon={stepItem.icon}
                label={stepItem.label}
                imageSize={24}
              />
              <span className="font-mono-plex text-[11px] whitespace-nowrap text-muted-foreground">
                {stepItem.label}
              </span>
              {index < STEPS.length - 1 && (
                <span
                  aria-hidden="true"
                  className="absolute top-1/2 -right-[5px] size-[9px] -translate-y-1/2 rounded-full border bg-muted dark:bg-secondary"
                />
              )}
            </div>
            {index < STEPS.length - 1 && (
              <svg
                aria-hidden="true"
                className="mx-1 hidden flex-1 sm:block"
                viewBox="0 0 100 32"
                preserveAspectRatio="none"
                style={{ height: 32, minWidth: 48 }}
              >
                <path
                  d="M 0 16 C 35 16, 65 16, 100 16"
                  fill="none"
                  stroke="var(--color-border)"
                  strokeWidth="2"
                />
                <path
                  className="relay-line"
                  d="M 0 16 C 35 16, 65 16, 100 16"
                  fill="none"
                  stroke="var(--color-primary)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray="10 50"
                  style={{ animationDelay: LINE_DELAYS[index] }}
                />
              </svg>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
