import { academicConditionLabels } from "../../shared/academic-result";
import { DataTable } from "../../shared/ui/DataTable";
import { Facts } from "../../shared/ui/Facts";
import { academicTime } from "../attendance/model";
import { displayedGrade } from "./grade-capture";
import type { ActEvent, StoredResult } from "./acts-model";

const actions: Record<string, string> = {
  CONFIRM_ACT_RESULT: "Resultado confirmado al cerrar",
  CORRECT_ACT_GRADE: "Corrección de nota",
  CORRECT_ACT_ATTENDANCE: "Corrección de asistencia",
};
export function StoredResultFacts({
  result,
  compact = false,
}: {
  result: StoredResult | null;
  compact?: boolean;
}) {
  if (!result) return <span>Sin resultado guardado</span>;
  if (compact)
    return (
      <div className="act-result-summary">
        <p>
          <strong>
            {result.condicion
              ? (academicConditionLabels[result.condicion] ?? result.condicion)
              : "Pendiente"}
          </strong>
        </p>
        <p>
          Nota oficial: {result.nota_oficial ?? "Pendiente"} · Promedio:{" "}
          {displayedGrade(result.promedio)}
        </p>
        <p>
          Inasistencia:{" "}
          {result.inasistencia_pct === null
            ? "Pendiente"
            : `${result.inasistencia_pct.replace(".", ",")} %`}{" "}
          · Faltas: {result.faltas_equivalentes}
        </p>
        <small>Versión del resultado: {result.version}</small>
      </div>
    );
  return (
    <Facts
      items={[
        [
          "Condición",
          result.condicion
            ? (academicConditionLabels[result.condicion] ?? result.condicion)
            : "Pendiente",
        ],
        ["Promedio", displayedGrade(result.promedio)],
        ["Nota oficial", result.nota_oficial ?? "Pendiente"],
        [
          "Inasistencia",
          result.inasistencia_pct === null
            ? "Pendiente"
            : `${result.inasistencia_pct.replace(".", ",")} %`,
        ],
        ["Faltas computables", result.faltas_equivalentes],
        ["Versión del resultado", result.version],
      ]}
    />
  );
}
export function ActHistory({
  items,
  labels = {},
}: {
  items: ActEvent[];
  labels?: Record<string, string>;
}) {
  return (
    <DataTable
      caption="Historial de resultados del acta"
      rows={items}
      rowKey={(event) => event.id}
      emptyMessage="No hay resultados confirmados ni correcciones registradas."
      columns={[
        {
          key: "accion",
          header: "Acción / matrícula",
          cell: (event) => (
            <>
              {actions[event.accion] ?? event.accion}
              <small className="attendance-document">
                {labels[event.valor_nuevo?.matricula_id ?? ""] ??
                  "Resultado del intento"}
              </small>
            </>
          ),
        },
        {
          key: "responsable",
          header: "Responsable / fecha",
          cell: (event) => (
            <>
              {event.nombre_usuario}
              <small className="attendance-document">
                {academicTime(event.ocurrido_at)}
              </small>
            </>
          ),
        },
        {
          key: "antes",
          header: "Resultado anterior",
          className: "attendance-calculation",
          cell: (event) => (
            <StoredResultFacts result={event.valor_anterior} compact />
          ),
        },
        {
          key: "despues",
          header: "Resultado nuevo",
          className: "attendance-calculation",
          cell: (event) => (
            <StoredResultFacts result={event.valor_nuevo} compact />
          ),
        },
        {
          key: "motivo",
          header: "Motivo",
          cell: (event) => event.motivo || "Sin motivo adicional",
        },
      ]}
    />
  );
}
