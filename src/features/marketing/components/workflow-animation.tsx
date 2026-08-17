import { GlobeIcon, MousePointerIcon } from "lucide-react";
import { NodeIcon } from "@/features/workflows/nodes/node-icon";

const STEPS = [
  { label: "Trigger", icon: MousePointerIcon, delay: "0s" },
  { label: "HTTP Request", icon: GlobeIcon, delay: "2s" },
  { label: "Gemini", icon: "/gemini.svg", delay: "4s" },
] as const;

const LINE_DELAYS = ["0.5s", "2.5s"] as const;

/**
 * A looping diagram of a workflow executing: the exact icons the real
 * node-selector/canvas use for Trigger, HTTP Request, and an AI provider
 * node, connected by animated lines a pulse travels along in sequence —
 * echoing the same loading/success visual language the editor already
 * uses for live execution (workflowRunChannel's status topic), just
 * looping for show instead of reporting a real run.
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
    <div className="w-full max-w-xl">
      <style>{`
        @keyframes relay-node-glow {
          0%, 8%, 100% { box-shadow: 0 0 0 0 transparent; border-color: var(--color-border); }
          4% { box-shadow: 0 0 0 6px color-mix(in oklab, var(--color-primary) 25%, transparent); border-color: var(--color-primary); }
        }
        @keyframes relay-line-flow {
          0%, 100% { stroke-dashoffset: 40; opacity: 0; }
          2% { opacity: 1; }
          22% { stroke-dashoffset: -40; opacity: 1; }
          24% { opacity: 0; }
        }
        .relay-node { animation: relay-node-glow 6s ease-in-out infinite; }
        .relay-line { animation: relay-line-flow 6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .relay-node, .relay-line { animation: none; }
        }
      `}</style>
      <div className="flex items-center">
        {STEPS.map((stepItem, index) => (
          <div key={stepItem.label} className="flex flex-1 items-center last:flex-none">
            <div
              className="relay-node flex shrink-0 flex-col items-center gap-2 rounded-2xl border-2 bg-card p-4"
              style={{ animationDelay: stepItem.delay }}
            >
              <NodeIcon icon={stepItem.icon} label={stepItem.label} imageSize={24} />
              <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">
                {stepItem.label}
              </span>
            </div>
            {index < STEPS.length - 1 && (
              <svg
                className="mx-1 hidden flex-1 sm:block"
                viewBox="0 0 100 4"
                preserveAspectRatio="none"
                style={{ height: 4, minWidth: 40 }}
              >
                <line x1="0" y1="2" x2="100" y2="2" stroke="var(--color-border)" strokeWidth="2" />
                <line
                  className="relay-line"
                  x1="0"
                  y1="2"
                  x2="100"
                  y2="2"
                  stroke="var(--color-primary)"
                  strokeWidth="2"
                  strokeDasharray="40 60"
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
