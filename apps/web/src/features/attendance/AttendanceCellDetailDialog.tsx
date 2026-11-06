import { Dialog } from "../../shared/Dialog";
import { Facts } from "../../shared/ui/Facts";
import {
  attendanceCodes,
  sessionDate,
  type AttendanceCode,
  type AttendanceRow,
  type ClassSession,
} from "./model";

export function AttendanceCellDetailDialog({
  student,
  session,
  code,
  sessionPath,
  onClose,
}: {
  student: AttendanceRow;
  session: ClassSession;
  code: AttendanceCode | null;
  sessionPath: string;
  onClose: () => void;
}) {
  return (
    <Dialog title="Detalle de asistencia" onClose={onClose}>
      <Facts
        items={[
          ["Estudiante", student.estudiante],
          ["Fecha", sessionDate(session.fecha)],
          ["Marca", code ? `${code} · ${attendanceCodes[code]}` : "Sin registrar"],
        ]}
      />
      <a href={`#${sessionPath}`}>Abrir registro de la sesión</a>
    </Dialog>
  );
}
