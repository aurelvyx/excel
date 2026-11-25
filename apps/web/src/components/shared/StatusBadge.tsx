import type { ReactNode } from "react";

export type BadgeTone = "emerald" | "amber" | "blue" | "rose" | "slate";

function inferTone(text: string, inactive?: boolean): BadgeTone {
  if (inactive) return "slate";
  const norm = text.toLowerCase();
  if (
    norm.includes("rechaz") ||
    norm.includes("anulad") ||
    norm.includes("desaprob") ||
    norm.includes("retirad")
  ) {
    return "rose";
  }
  if (norm.includes("pendien") || norm.includes("planific")) {
    return "amber";
  }
  if (norm.includes("cerrad") || norm.includes("inactiv")) {
    return "slate";
  }
  if (
    norm.includes("activ") ||
    norm.includes("abiert") ||
    norm.includes("validad") ||
    norm.includes("aprobad")
  ) {
    return "emerald";
  }
  return "blue";
}

export function StatusBadge({
  tone,
  inactive = false,
  dot = true,
  children,
}: {
  tone?: BadgeTone;
  inactive?: boolean;
  dot?: boolean;
  children: ReactNode;
}) {
  const resolvedTone =
    tone ?? inferTone(typeof children === "string" ? children : "", inactive);

  return (
    <span className={`ds-badge ${resolvedTone}`}>
      {dot && <span className="ds-badge-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

