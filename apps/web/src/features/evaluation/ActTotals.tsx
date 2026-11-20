import { Facts } from "../../shared/ui/Facts";
import type { ActTotals as Totals } from "./acts-model";
import "../academic/components/workspace.css";

export function ActTotals({ value }: { value: Totals }) {
  return (
    <div className="workspace-facts">
      <Facts
        items={[
          ["Matrículas revisables", value.matriculas],
          ["Resultados completos", value.listos],
          ["Aprobados", value.aprobados],
          ["Desaprobados", value.desaprobados],
          ["Retirados por inasistencia", value.retirados],
          ["Resultados pendientes", value.pendientes],
        ]}
      />
    </div>
  );
}
