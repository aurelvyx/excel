import type { ReactNode } from "react";
import "./workspace.css";

/** Tarjetas de contexto reutilizadas en las pantallas recuperadas de Front/1. */
export function WorkspaceSummary({
  items,
  label = "Resumen del grupo",
}: {
  items: {
    label: string;
    value: ReactNode;
    detail?: ReactNode;
    tone?: "green" | "amber" | "blue" | "slate";
  }[];
  label?: string;
}) {
  return (
    <section className="workspace-summary" aria-label={label}>
      {items.map((item) => (
        <div
          className={`workspace-summary-card workspace-tone-${item.tone ?? "slate"}`}
          key={item.label}
        >
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          {item.detail && <small>{item.detail}</small>}
        </div>
      ))}
    </section>
  );
}
