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
 * rounded badge (the same "logo tile" treatment most integration lists use)
 * keeps every brand mark visible regardless of theme, without needing to
 * know or fix each SVG's own colors.
 */
export function NodeIcon({
  icon: Icon,
  label,
  className = "size-5",
  imageSize = 20,
}: NodeIconProps) {
  if (typeof Icon !== "string") {
    return <Icon className={className} />;
  }

  const badgeSize = imageSize + 8;
  return (
    <div
      className="flex items-center justify-center shrink-0 rounded-md bg-white p-1"
      style={{ width: badgeSize, height: badgeSize }}
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
