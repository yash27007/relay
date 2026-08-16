"use client";

import Image from "next/image";
import type { ComponentType } from "react";

interface NodeIconProps {
  /** A lucide icon component, or a path to an SVG under public/ (e.g. "/openai.svg"). */
  icon: ComponentType<{ className?: string }> | string;
  label: string;
  /** className applied to the lucide icon when `icon` is a component. */
  className?: string;
  /** Pixel size of the rendered SVG when `icon` is a path (default 20, matches size-5). */
  imageSize?: number;
}

/**
 * Renders a node's icon, handling both lucide components and SVG paths under
 * public/ uniformly. SVG logos (e.g. openai.svg) don't all set an explicit
 * fill — some default to black — which disappears against a dark sheet or
 * canvas background. Wrapping every path-based icon in a small white,
 * rounded-corner badge (the same "logo tile" treatment most integration
 * lists use) keeps every brand mark visible regardless of theme, without
 * needing to know or fix each SVG's own colors.
 *
 * Both branches render inside the same fixed-size slot (`imageSize + 8px`).
 * Without this, a bare lucide icon (16px, unwrapped) and a logo badge (16px
 * image + 8px padding = 24px box) produced visibly different footprints,
 * so a node using a lucide icon (HTTP Request, IF, Switch) rendered smaller
 * on the canvas than a node using a logo (OpenAI, Agent, ...) — the slot
 * makes every node card the same size regardless of which kind of icon it
 * uses.
 */
export function NodeIcon({
  icon: Icon,
  label,
  className = "size-5",
  imageSize = 20,
}: NodeIconProps) {
  const slotSize = imageSize + 8;

  if (typeof Icon !== "string") {
    return (
      <div
        className="flex items-center justify-center shrink-0"
        style={{ width: slotSize, height: slotSize }}
      >
        <Icon className={className} />
      </div>
    );
  }

  return (
    <div
      className="flex items-center justify-center shrink-0 rounded-lg bg-white p-1"
      style={{ width: slotSize, height: slotSize }}
    >
      <Image
        src={Icon}
        alt={label}
        width={imageSize}
        height={imageSize}
        className="object-contain"
      />
    </div>
  );
}
