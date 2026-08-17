import Link from "next/link";
import { Button } from "@/components/ui/button";
import { WorkflowAnimation } from "./workflow-animation-lazy";

/**
 * The hero doesn't illustrate the canvas — it sits on top of one. The
 * dot-grid background is the same "graph paper" pattern the real editor's
 * <Background /> renders behind every workflow, and it's a continuous field
 * across the whole hero (not boxed to one half) so the copy and the node
 * diagram both read as sitting directly on that canvas rather than in a
 * card floating over it — no border, no panel background, just type set
 * large enough to hold its own against the texture behind it.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden border-b">
      {/* Ambient wash behind the whole hero — one soft light source the
          copy panel and the canvas both sit under, instead of two
          separately-lit islands. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 50% 15%, color-mix(in oklab, var(--color-primary) 16%, transparent), transparent 70%)",
        }}
      />

      {/* The dot grid: previously masked to an ellipse hugging the copy
          panel, so it faded to nothing under the node diagram (the "stray
          square" was one isolated dot at the edge of that fade). Fading
          only the top/bottom edges keeps it a continuous field the full
          width of the hero, so panel and diagram read as one canvas. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.55] dark:opacity-[0.35]"
        style={{
          backgroundImage:
            "radial-gradient(circle, var(--color-border) 1px, transparent 1px)",
          backgroundSize: "26px 26px",
          maskImage:
            "linear-gradient(to bottom, transparent, black 15%, black 85%, transparent)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent, black 15%, black 85%, transparent)",
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

      <div className="relative mx-auto grid max-w-6xl gap-14 px-6 pt-20 pb-24 sm:pt-28 sm:pb-32 lg:grid-cols-[34rem_1fr] lg:items-center lg:gap-x-16">
        <div className="relay-hero-panel flex flex-col gap-6">
          <div className="flex items-center gap-2 font-mono-plex text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full motion-safe:animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
            </span>
            Visual workflow automation
          </div>
          <h1 className="font-poppins text-5xl leading-[0.95] font-extrabold tracking-tighter text-balance sm:text-6xl lg:text-7xl">
            Wire it once.
            <br />
            <span className="text-primary">Watch it run.</span>
          </h1>
          <p className="max-w-md text-balance text-muted-foreground">
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

        <div className="max-w-lg">
          <WorkflowAnimation />
        </div>
      </div>
    </section>
  );
}
