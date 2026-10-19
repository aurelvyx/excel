import type { ReactNode } from "react";

export function Facts({
  items,
  emptyLabel = "Sin seleccionar",
}: {
  items: readonly (readonly [string, ReactNode])[];
  emptyLabel?: string;
}) {
  return (
    <dl className="facts">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>
            {value === undefined || value === null || value === ""
              ? emptyLabel
              : value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
