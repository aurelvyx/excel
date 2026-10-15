import type { ReactNode } from "react";
import { Button } from "./Button";

export function CaptureToolbar({
  changes,
  unit = ["fila", "filas"],
  busy,
  reloadLabel,
  onReload,
  children,
}: {
  changes: number;
  unit?: readonly [string, string];
  busy: boolean;
  reloadLabel: string;
  onReload: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="selection-toolbar attendance-toolbar">
      <div>
        {children}
        <Button disabled={busy} onClick={onReload}>
          {reloadLabel}
        </Button>
      </div>
      <span role="status">
        {changes
          ? `${changes} ${unit[changes === 1 ? 0 : 1]} con cambios sin guardar`
          : "Sin cambios pendientes"}
      </span>
    </div>
  );
}
