import { BotIcon, GlobeIcon, KeyIcon, WorkflowIcon } from "lucide-react";
import type { ComponentType } from "react";

const FEATURES: { icon: ComponentType<{ className?: string }>; title: string; description: string }[] = [
  {
    icon: WorkflowIcon,
    title: "Visual canvas",
    description:
      "Drag nodes onto a canvas and connect them into a flow — triggers, branches, and actions, all visible at a glance.",
  },
  {
    icon: BotIcon,
    title: "AI-native nodes",
    description:
      "OpenAI, Anthropic, Gemini, Groq, DeepSeek, Mistral, Moonshot, or a local Ollama model — call any of them from a single node, with an AI agent that can use your other nodes as tools.",
  },
  {
    icon: GlobeIcon,
    title: "Real integrations",
    description:
      "HTTP requests, conditional branching, and multi-way routing — the building blocks for automations that actually do something.",
  },
  {
    icon: KeyIcon,
    title: "Your credentials, encrypted",
    description:
      "API keys and connected accounts are encrypted at rest and scoped to you — every workflow node only ever reads what it's authorized to.",
  },
];

export function Features() {
  return (
    <section className="border-t bg-card/30 px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-poppins text-3xl font-semibold tracking-tight sm:text-4xl">
            Everything a workflow needs
          </h2>
          <p className="mt-3 text-muted-foreground">
            Relay isn&apos;t a diagram of your automation — it&apos;s the automation.
          </p>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="rounded-2xl border bg-card p-6">
              <div className="mb-4 flex size-10 items-center justify-center rounded-[8px] bg-primary/10">
                <feature.icon className="size-5 text-primary" />
              </div>
              <h3 className="font-medium">{feature.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
