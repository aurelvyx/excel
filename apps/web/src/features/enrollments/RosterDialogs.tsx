import { useState, type FormEvent } from "react";
import { Dialog } from "../../shared/Dialog";
import { Button } from "../../shared/ui/Button";
import { Feedback, Loading } from "../../shared/ui/Feedback";
import { SelectField, TextAreaField } from "../../shared/ui/Field";
import { Facts } from "../../shared/ui/Facts";
import { StatusBadge } from "../../shared/ui/StatusBadge";
import { api, errorText, text, type Page, type Row } from "../../shared/api";
import { useApiQuery } from "../../shared/useApiQuery";
import { enrollmentStateLabels } from "./state-labels";

/** Cambio de grupo dentro del mismo periodo y nivel; la API revalida y audita. */
export function ChangeGroupDialog({
  enrollment,
  group,
  onClose,
  onSaved,
}: {
  enrollment: Row;
  group: Row;
  onClose: () => void;
  onSaved: () => void;
}) {
  const groups = useApiQuery<Page>(
    `matriculas/grupos?periodoId=${text(group, "periodo_id")}&limit=100`,
  );
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const options = (groups.data?.items ?? []).filter(
    (item) =>
      text(item, "nivel_id") === text(group, "nivel_id") &&
      String(item.id) !== String(group.id) &&
      ["PLANIFICADO", "ACTIVO"].includes(text(item, "estado")),
  );
  const name = `${text(enrollment, "nombres")} ${text(enrollment, "apellido_paterno")}`;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!target || !reason.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api(`matriculas/${enrollment.id}/grupo`, {
        method: "PATCH",
        body: { grupoId: target, motivo: reason.trim() },
      });
      onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title={`Cambiar de grupo · ${name}`} onClose={onClose} busy={busy}>
      <form noValidate onSubmit={(event) => void submit(event)}>
        <p className="muted">
          Matrícula {text(enrollment, "codigo")} · Grupo actual{" "}
          {text(group, "codigo")}. Solo se admite otro grupo del mismo periodo y
          nivel, y mientras no existan asistencias, notas ni resultados.
        </p>
        {groups.loading ? (
          <Loading>Cargando grupos…</Loading>
        ) : groups.error ? (
          <Feedback onRetry={groups.reload}>{groups.error}</Feedback>
        ) : (
          <SelectField
            label="Nuevo grupo"
            id="change-group-target"
            required
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            hint={
              options.length
                ? undefined
                : "No hay otro grupo disponible para este nivel y periodo."
            }
          >
            <option value="">Selecciona un grupo</option>
            {options.map((item) => (
              <option key={item.id} value={String(item.id)}>
                {text(item, "codigo")} · {text(item, "turno")} · Sección{" "}
                {text(item, "seccion")} ({text(item, "matriculados")}
                {text(item, "capacidad") ? `/${text(item, "capacidad")}` : ""})
              </option>
            ))}
          </SelectField>
        )}
        <TextAreaField
          label="Motivo del cambio"
          id="change-group-reason"
          required
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        <Feedback>{error}</Feedback>
        <footer className="actions">
          <Button disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={!target || !reason.trim()}
            busy={busy}
            busyLabel="Guardando…"
          >
            Confirmar cambio de grupo
          </Button>
        </footer>
      </form>
    </Dialog>
  );
}

/** Datos generales del estudiante y de su matrícula en este grupo. */
export function StudentSummaryDialog({
  enrollment,
  group,
  onClose,
}: {
  enrollment: Row;
  group: Row;
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
              ["Boleta de pago", text(enrollment, "voucher_numero")],
              [
                "Importe",
                enrollment.voucher_importe
                  ? `S/ ${text(enrollment, "voucher_importe")}`
                  : "",
              ],
            ]}
          />
        </div>
      )}
    </Dialog>
  );
}
