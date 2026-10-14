import { Dialog } from "../../shared/Dialog";
import { useApiQuery } from "../../shared/useApiQuery";
import { DataTable } from "../../shared/ui/DataTable";
import { Facts } from "../../shared/ui/Facts";
import { Feedback, Loading } from "../../shared/ui/Feedback";
import {
  academicTime,
  attendanceCodes,
  sessionDate,
  type AttendanceClosureEvent,
  type AttendanceCode,
  type AttendanceRecord,
  type AttendanceRow,
  type ClassSession,
} from "./model";

type Change = {
  codigo: AttendanceCode;
  observacion: string | null;
  version: number;
};
type HistoryData = {
  asistencia: AttendanceRecord | null;
  cierre: AttendanceClosureEvent | null;
  items: {
    id: string;
    accion: string;
    usuario_id: string | null;
    nombre_usuario: string | null;
    ocurrido_at: string;
    motivo: string | null;
    valor_anterior: Change | null;
    valor_nuevo: Change;
  }[];
};
const actions: Record<string, string> = {
  CREATE: "Registro",
  UPDATE: "Modificación",
  CORRECT: "Corrección administrativa",
  CORRECT_AFTER_CLOSE: "Corrección administrativa",
};
function Mark({ value }: { value: Change | null }) {
  return value ? (
    <>
      {value.codigo} · {attendanceCodes[value.codigo]}
      <small className="attendance-document">
        {value.observacion || "Sin observación"}
      </small>
    </>
  ) : (
    <>Sin registro</>
  );
}
export function AttendanceHistoryDialog({
  row,
  session,
  endpoint,
  onClose,
}: {
  row: AttendanceRow;
  session: ClassSession;
  endpoint: string;
  onClose: () => void;
}) {
  const { data, loading, error, reload } = useApiQuery<HistoryData>(
    `${endpoint}/${row.matricula_id}/historial`,
  );
  return (
    <Dialog title="Historial de asistencia" onClose={onClose}>
      <Facts
        items={[
          ["Estudiante", row.estudiante],
          ["Matrícula", row.codigo_matricula],
          ["Intento", row.numero_intento],
          ["Fecha de clase", sessionDate(session.fecha)],
        ]}
      />
      {loading ? (
        <Loading>Cargando historial de asistencia…</Loading>
      ) : error ? (
        <Feedback onRetry={reload}>{error}</Feedback>
      ) : (
        data && (
          <>
            {data.cierre && (
              <p className="notice">
                Asistencia cerrada por {data.cierre.realizado_nombre} ·{" "}
                {academicTime(data.cierre.realizado_at)}.
              </p>
            )}
            <h3>Registro vigente</h3>
            <Mark value={data.asistencia} />
            <DataTable
              caption="Cambios de asistencia"
              rows={data.items}
              rowKey={(event) => event.id}
              emptyMessage="No hay cambios registrados para esta asistencia."
              columns={[
                {
                  key: "accion",
                  header: "Acción",
                  cell: (event) =>
                    actions[event.accion] ?? "Cambio de asistencia",
                },
                {
                  key: "responsable",
                  header: "Responsable",
                  cell: (event) =>
                    event.nombre_usuario ?? "Usuario no disponible",
                },
                {
                  key: "fecha",
                  header: "Fecha",
                  cell: (event) => academicTime(event.ocurrido_at),
                },
                {
                  key: "anterior",
                  header: "Valor anterior",
                  cell: (event) => <Mark value={event.valor_anterior} />,
                },
                {
                  key: "nuevo",
                  header: "Valor nuevo",
                  cell: (event) => <Mark value={event.valor_nuevo} />,
                },
                {
                  key: "motivo",
                  header: "Motivo",
                  cell: (event) => event.motivo || "Sin motivo adicional",
                },
              ]}
            />
          </>
        )
      )}
    </Dialog>
  );
}
