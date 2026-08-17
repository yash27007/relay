import Link from "next/link";
import { Button } from "@/components/ui/button";
import { WorkflowAnimation } from "./workflow-animation";

export function Hero() {
  return (
    <section className="relative overflow-hidden px-6 pt-24 pb-20 sm:pt-32 sm:pb-28">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-12 text-center">
        <div className="flex flex-col items-center gap-6">
          <span className="rounded-full border bg-card px-4 py-1.5 text-xs font-medium text-muted-foreground">
            Visual workflow automation
          </span>
          <h1 className="max-w-3xl text-balance font-poppins text-4xl font-semibold tracking-tight sm:text-6xl">
            Automate anything. <span className="text-primary">Watch it run.</span>
          </h1>
          <p className="max-w-xl text-balance text-lg text-muted-foreground">
            Relay is a visual canvas for building automations that call APIs, run AI
            models, and react to triggers — wired together node by node, executed step
            by step, in real time.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Button size="lg" asChild>
            <Link href="/signup">Start building — it&apos;s free</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
        <div className="w-full rounded-3xl border bg-muted/30 p-8 sm:p-12">
          <WorkflowAnimation />
        </div>
      </div>
    </section>
  );
}
