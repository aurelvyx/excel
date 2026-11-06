import { Dialog } from "../../shared/Dialog";
import { Feedback, Loading } from "../../shared/ui/Feedback";
import { Facts } from "../../shared/ui/Facts";
import { StatusBadge } from "../../shared/ui/StatusBadge";
import { text, type Row } from "../../shared/api";
import { useApiQuery } from "../../shared/useApiQuery";
import { enrollmentStateLabels } from "./state-labels";

/** Datos generales del estudiante y de su matrícula en este grupo. */
export function StudentSummaryDialog({
  enrollment,
  group,
  canViewVoucher,
  onClose,
}: {
  enrollment: Row;
  group: Row;
  canViewVoucher: boolean;
  onClose: () => void;
}) {
  const student = useApiQuery<Row>(`estudiantes/${enrollment.estudiante_id}`);
  const s = student.data;
  const fullName = `${text(enrollment, "apellido_paterno")} ${text(enrollment, "apellido_materno")}, ${text(enrollment, "nombres")}`;
  return (
    <Dialog title={fullName} onClose={onClose}>
      {student.loading ? (
        <Loading>Cargando datos del estudiante…</Loading>
      ) : student.error ? (
        <Feedback onRetry={student.reload}>{student.error}</Feedback>
      ) : (
        <div className="student-summary">
          <h3>Datos del estudiante</h3>
          <Facts
            emptyLabel="Sin registrar"
            items={[
              ["Código", text(enrollment, "codigo_estudiante")],
              [
                "Documento",
                `${text(enrollment, "tipo_documento")} ${text(enrollment, "numero_documento")}`,
              ],
              [
                "Edad",
                enrollment.edad == null ? "" : `${text(enrollment, "edad")} años`,
              ],
              ["Nacimiento", s ? text(s, "persona.fechaNacimiento") : ""],
              ["Teléfono", s ? text(s, "persona.telefono") : ""],
              ["Correo", s ? text(s, "persona.correo") : ""],
              ["Dirección", s ? text(s, "persona.direccion") : ""],
              ["Registro", s ? text(s, "fecha_registro") : ""],
            ]}
          />
          <h3>Matrícula en este grupo</h3>
          <Facts
            emptyLabel="Pendiente"
            items={[
              ["Código", text(enrollment, "codigo")],
              ["Intento", text(enrollment, "numero_intento")],
              [
                "Estado",
                <StatusBadge
                  key="estado"
                  inactive={enrollment.estado !== "ACTIVA"}
                >
                  {enrollmentStateLabels[text(enrollment, "estado")] ??
                    text(enrollment, "estado")}
                </StatusBadge>,
              ],
              ["Fecha de matrícula", text(enrollment, "fecha_matricula")],
              ["Grupo", text(group, "codigo")],
              [
                "Turno y sección",
                `${text(group, "turno")} · ${text(group, "seccion")}`,
              ],
              ...(canViewVoucher ? [
                ["Boleta de pago", text(enrollment, "voucher_numero")] as const,
                [
                  "Importe",
                  enrollment.voucher_importe
                    ? `S/ ${text(enrollment, "voucher_importe")}`
                    : "",
                ] as const,
              ] : []),
            ]}
          />
        </div>
      )}
    </Dialog>
  );
}
