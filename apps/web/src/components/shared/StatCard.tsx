import type { ReactNode } from "react";

export type StatTone = "emerald" | "amber" | "blue" | "rose" | "slate";

export function StatCardGrid({
  children,
  label = "Indicadores de resumen",
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <section className="ds-kpi-grid" aria-label={label}>
      {children}
    </section>
  );
}

export function StatCard({
  label,
  value,
  sublabel,
  icon,
  tone = "emerald",
  active = false,
  onClick,
}: {
  label: string;
  value: ReactNode;
  sublabel?: ReactNode;
  icon?: ReactNode;
  tone?: StatTone;
  active?: boolean;
  onClick?: () => void;
}) {
  const classes = [
    "ds-kpi-card",
    onClick ? "ds-kpi-card--interactive" : "",
    active ? "ds-kpi-card--active" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      <div className="ds-kpi-info">
        <span className="ds-kpi-label">{label}</span>
        <span className="ds-kpi-value">{value}</span>
        {sublabel && <span className="ds-kpi-sub">{sublabel}</span>}
      </div>
      {icon && <div className={`ds-kpi-badge ${tone}`}>{icon}</div>}
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={classes} onClick={onClick}>
        {content}
      </button>
    );
  }

  return <div className={classes}>{content}</div>;
}

