import { Dialog } from "../../shared/Dialog";
import { useApiQuery } from "../../shared/useApiQuery";
import { DataTable } from "../../shared/ui/DataTable";
import { Feedback, Loading } from "../../shared/ui/Feedback";
import { academicTime } from "../attendance/model";
import { displayedGrade } from "./grade-capture";
import type { GradeHistory } from "./grades-model";

export function GradeHistoryDialog({
  name,
  indicator,
  endpoint,
  onClose,
}: {
  name: string;
  indicator: string;
  endpoint: string;
  onClose: () => void;
}) {
  const { data, loading, error, reload } = useApiQuery<GradeHistory>(endpoint);
  return (
    <Dialog title="Historial de calificación" onClose={onClose}>
      <p>
        {name} · {indicator}
      </p>
      {loading ? (
        <Loading>Cargando historial…</Loading>
      ) : error ? (
        <Feedback onRetry={reload}>{error}</Feedback>
      ) : (
        <DataTable
          caption="Historial de calificación"
          rows={data?.items ?? []}
          rowKey={(row) => row.id}
          emptyMessage="No hay cambios registrados para esta calificación."
          columns={[
            {
              key: "accion",
              header: "Acción",
              cell: (row) =>
                row.accion === "CREATE_GRADE"
                  ? "Registro de nota"
                  : row.accion === "UPDATE_GRADE"
                    ? "Actualización de nota"
                    : row.accion === "CORRECT_CLOSED_GRADE"
                      ? "Corrección de nota con acta cerrada"
                      : row.accion,
            },
            {
              key: "usuario",
              header: "Responsable",
              cell: (row) => row.nombre_usuario,
            },
            {
              key: "fecha",
              header: "Fecha",
              cell: (row) => academicTime(row.ocurrido_at),
            },
            {
              key: "antes",
              header: "Nota anterior",
              cell: (row) => displayedGrade(row.valor_anterior?.nota ?? null),
            },
            {
              key: "despues",
              header: "Nota nueva",
              cell: (row) => displayedGrade(row.valor_nuevo?.nota ?? null),
            },
            {
              key: "motivo",
              header: "Motivo",
              cell: (row) => row.motivo ?? "—",
            },
          ]}
        />
      )}
    </Dialog>
  );
}
