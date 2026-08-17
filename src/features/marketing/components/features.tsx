"use client";

import {
  BotIcon,
  GitBranchIcon,
  GlobeIcon,
  KeyIcon,
  MousePointerIcon,
  SplitIcon,
} from "lucide-react";
import { NodeIcon } from "@/features/workflows/nodes/node-icon";

// The real node palette — same types, labels, and icons as node-selector.tsx.
// Structure as information: this isn't four invented feature bullets, it's
// literally what you can drop on the canvas.
const NODE_SHELF = [
  { label: "Trigger Manually", icon: MousePointerIcon },
  { label: "HTTP Request", icon: GlobeIcon },
  { label: "IF", icon: GitBranchIcon },
  { label: "Switch", icon: SplitIcon },
  { label: "AI Agent", icon: BotIcon },
  { label: "OpenAI", icon: "/openai.svg" },
  { label: "Anthropic", icon: "/anthropic.svg" },
  { label: "Gemini", icon: "/gemini.svg" },
  { label: "Groq", icon: "/groq.svg" },
  { label: "DeepSeek", icon: "/deepseek.svg" },
  { label: "Mistral", icon: "/mistral.svg" },
  { label: "Moonshot AI", icon: "/moonshot.svg" },
  { label: "Ollama", icon: "/ollama.svg" },
] as const;

const DIFFERENTIATORS = [
  {
    icon: GitBranchIcon,
    title: "Branch for real",
    description:
      "IF and Switch nodes route execution down only the branch that's taken — the untaken path's side effects, like an HTTP call, never fire.",
  },
  {
    icon: BotIcon,
    title: "AI that can act",
    description:
      "The Agent node runs a multi-step tool-calling loop, calling your other nodes as tools mid-conversation, not just generating text.",
  },
  {
    icon: KeyIcon,
    title: "Your keys stay yours",
    description:
      "API keys and connected accounts are encrypted at rest and scoped to you — every node only ever reads what it's authorized to.",
  },
] as const;

export function Features() {
  return (
    <section className="border-b bg-card/30 px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-xl">
          <p className="font-mono-plex text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
            The palette
          </p>
          <h2 className="mt-2 font-poppins text-3xl font-bold tracking-tight sm:text-4xl">
            13 nodes. One canvas.
          </h2>
          <p className="mt-3 text-muted-foreground">
            Triggers, branches, real HTTP calls, and eight AI
            providers — every node runs for real, not a mockup.
          </p>
        </div>

        <div className="mt-10 flex flex-wrap gap-2.5">
          {NODE_SHELF.map((node) => (
            <div
              key={node.label}
              className="flex items-center gap-2 rounded-md border bg-card py-2 pr-4 pl-2.5 transition-colors hover:border-primary"
            >
              <NodeIcon
                icon={node.icon}
                label={node.label}
                imageSize={16}
              />
              <span className="font-mono-plex text-xs text-foreground">
                {node.label}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-3">
          {DIFFERENTIATORS.map((feature) => (
            <div
              key={feature.title}
              className="rounded-md border bg-card p-6"
            >
              <div className="mb-4 flex size-9 items-center justify-center rounded-md bg-primary/10">
                <feature.icon className="size-4 text-primary" />
              </div>
              <h3 className="font-poppins font-semibold">
                {feature.title}
              </h3>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
