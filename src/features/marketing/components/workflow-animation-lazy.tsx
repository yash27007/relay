"use client";

import dynamic from "next/dynamic";

// `dynamic(..., { ssr: false })` must be called from a Client Component —
// isolating it here lets hero.tsx (a Server Component) render this without
// itself becoming a client boundary.
export const WorkflowAnimation = dynamic(
  () =>
    import("./workflow-animation").then((m) => m.WorkflowAnimation),
  {
    ssr: false,
    loading: () => <div className="h-44 w-full" aria-hidden="true" />,
  },
);
