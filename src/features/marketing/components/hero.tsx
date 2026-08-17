import Link from "next/link";
import { Button } from "@/components/ui/button";
import { WorkflowAnimation } from "./workflow-animation-lazy";

/**
 * The hero doesn't illustrate the canvas — it sits on top of one. The
 * dot-grid background below is the same "graph paper" pattern the real
 * editor's <Background /> renders behind every workflow; the copy panel
 * is styled like a docked inspector panel rather than a centered marketing
 * block, and WorkflowAnimation is built from the app's actual node-card
 * and handle styling, not an abstract illustration.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden border-b">
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-[0.55] dark:opacity-[0.35]"
        style={{
          backgroundImage:
            "radial-gradient(circle, var(--color-border) 1px, transparent 1px)",
          backgroundSize: "26px 26px",
          maskImage:
            "radial-gradient(ellipse 80% 60% at 50% 30%, black 30%, transparent 80%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 60% at 50% 30%, black 30%, transparent 80%)",
        }}
      />

      <style>{`
        @keyframes relay-panel-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .relay-hero-panel { animation: relay-panel-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) both; }
        @media (prefers-reduced-motion: reduce) {
          .relay-hero-panel { animation: none; }
        }
      `}</style>

      <div className="relative mx-auto grid max-w-6xl gap-14 px-6 pt-20 pb-24 sm:pt-28 sm:pb-32 lg:grid-cols-[26rem_1fr] lg:items-center lg:gap-x-16">
        <div className="relay-hero-panel flex flex-col gap-6 rounded-xl border bg-card/90 p-8 shadow-sm backdrop-blur-sm">
          <div className="flex items-center gap-2 font-mono-plex text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full motion-safe:animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
            </span>
            Visual workflow automation
          </div>
          <h1 className="font-poppins text-4xl leading-[1.05] font-bold tracking-tight text-balance sm:text-5xl">
            Wire it once.
            <br />
            <span className="text-primary">Watch it run.</span>
          </h1>
          <p className="text-balance text-muted-foreground">
            A visual canvas for shipping real automations — HTTP
            calls, AI reasoning, conditional branches — wired together
            node by node and executed step by step, live.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button size="lg" asChild>
              <Link href="/signup">
                Start building — it&apos;s free
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        </div>

        <WorkflowAnimation />
      </div>
    </section>
  );
}
