import type { ReactNode } from "react";

export function FilterToolbar({
  children,
  right,
  label = "Filtros de búsqueda",
}: {
  children: ReactNode;
  right?: ReactNode;
  label?: string;
}) {
  return (
    <section className="ds-toolbar" aria-label={label}>
      <div className="ds-toolbar-left">{children}</div>
      {right}
    </section>
  );
}

export interface SegmentOption<T extends string = string> {
  value: T;
  label: ReactNode;
}

export function SegmentedFilter<T extends string = string>({
  options,
  value,
  onChange,
  label = "Filtro por estado",
}: {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
}) {
  return (
    <div className="ds-segment-group" role="group" aria-label={label}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`ds-segment-btn ${value === opt.value ? "active" : ""}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

