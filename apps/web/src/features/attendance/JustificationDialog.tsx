import { useRef, useState, type FormEvent } from "react";
import { ApiError, api, errorText } from "../../shared/api";
import { Dialog } from "../../shared/Dialog";
import { FormDialog } from "../../shared/FormDialog";
import { DataTable } from "../../shared/ui/DataTable";
import { Facts } from "../../shared/ui/Facts";
import { Feedback } from "../../shared/ui/Feedback";
import { InputField, SelectField, TextAreaField } from "../../shared/ui/Field";
import { AttendanceSummary } from "./AttendanceSummary";
import {
  justificationActions,
  justificationEventLabels,
  justificationStates,
  justificationTime,
  type JustificationAction,
  type JustificationDetail,
  type JustificationRow,
  type JustificationState,
} from "./justification-model";
import { sessionDate, sessionStates } from "./model";

const formLabels = {
  REGISTER: ["Revisar solicitud", "Confirmar solicitud"],
  RESOLVE: ["Revisar resolución", "Confirmar resolución"],
  RECOVER: ["Revisar recuperación", "Confirmar recuperación"],
} as const;

export function JustificationDialog({
  row,
  action,
  today,
  endpoint,
  onClose,
  onSaved,
  onConflict,
  onReload,
}: {
  row: JustificationDetail;
  action: JustificationAction;
  today: string;
  endpoint: string;
  onClose: () => void;
  onSaved: (row: JustificationRow) => void;
  onConflict: () => void;
  onReload: () => void;
}) {
  const request = row.justificacion;
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(today);
  const [decision, setDecision] = useState("");
  const [note, setNote] = useState("");
  const [review, setReview] = useState(false);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [error, fail] = useState("");
  const [busy, pending] = useState(false);
  const [conflict, setConflict] = useState(false);
  const submitting = useRef(false);
  const allowed =
    action === "REGISTER"
      ? row.puedeRegistrar
      : action === "RESOLVE"
        ? row.puedeResolver
        : action === "RECOVER"
          ? row.puedeConfirmarRecuperacion
          : false;
  const context = (
    <>
      <Facts
        emptyLabel="Pendiente"
        items={[
          ["Estudiante", row.estudiante],
          ["Documento", `${row.tipo_documento} ${row.numero_documento}`],
          ["Matrícula", row.codigo_matricula],
          ["Intento", row.numero_intento],
          ["Estado de matrícula", row.estado_matricula],
          ["Fecha de clase", sessionDate(row.fecha_sesion)],
          ["Estado de sesión", sessionStates[row.estado_sesion]],
          ["Marca original", "J · Falta justificada"],
          [
            "Estado de solicitud",
            justificationStates[request?.estado ?? "SIN_SOLICITUD"],
          ],
        ]}
      />
      {request && (
        <section
          className="justification-detail"
          aria-label="Solicitud registrada"
        >
          <h3>Solicitud registrada</h3>
          <Facts
            emptyLabel="Pendiente"
            items={[
              ["Motivo", request.motivo],
              [
                "Fecha de presentación",
                sessionDate(request.fecha_presentacion),
              ],
              ["Registrada por", request.registrado_nombre],
              ["Fecha de registro", justificationTime(request.registrado_at)],
              ["Resuelta por", request.resuelto_nombre],
              ["Fecha de resolución", justificationTime(request.resuelto_at)],
              [
                "Observación de resolución",
                request.observacion_resolucion ?? "Sin observación",
              ],
              ["Recuperación confirmada por", request.recuperacion_nombre],
              [
                "Fecha de recuperación",
                justificationTime(request.recuperacion_at),
              ],
              [
                "Observación de recuperación",
                request.observacion_recuperacion ?? "Sin observación",
              ],
            ]}
          />
        </section>
      )}
      <AttendanceSummary
        summary={row.resumenAsistencia}
        label="Resumen de asistencia del intento"
        compact
        stale={conflict}
      />
      {!!row.historial?.length && (
        <details className="justification-detail">
          <summary>Ver historial de decisiones</summary>
          <DataTable
            caption="Historial de justificación"
            rows={row.historial}
            rowKey={(event) => event.id}
            columns={[
              {
                key: "accion",
                header: "Acción",
                cell: (event) =>
                  justificationEventLabels[event.accion] ?? "Acción registrada",
              },
              {
                key: "usuario",
                header: "Responsable",
                cell: (event) => event.nombre_usuario,
              },
              {
                key: "fecha",
                header: "Fecha",
                cell: (event) => justificationTime(event.ocurrido_at),
              },
              {
                key: "estado",
                header: "Cambio de estado",
                cell: (event) =>
                  `${event.estado_anterior ? justificationStates[event.estado_anterior] : "Sin solicitud"} → ${justificationStates[event.estado_nuevo]}`,
              },
              {
                key: "motivo",
                header: "Motivo u observación",
                cell: (event) => event.motivo || "Sin observación",
              },
            ]}
          />
        </details>
      )}
    </>
  );
  function validate(form: HTMLFormElement) {
    const next: Record<string, string> = {};
    if (action === "REGISTER") {
      if (!reason.trim()) next.reason = "Indica el motivo de la justificación.";
      else if (reason.trim().length > 500)
        next.reason = "El motivo admite hasta 500 caracteres.";
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        date < row.fecha_sesion ||
        date > today
      )
        next.date =
          "La fecha debe estar entre la clase y la fecha actual en Lima.";
    } else {
      const valid =
        action === "RESOLVE"
          ? ["APROBADA", "RECHAZADA"]
          : ["RECUPERADA", "NO_RECUPERADA"];
      if (!valid.includes(decision)) next.decision = "Selecciona una decisión.";
      if (action === "RESOLVE" && !note.trim())
        next.note = "Indica la observación de resolución.";
      else if (note.trim().length > 300)
        next.note = "La observación admite hasta 300 caracteres.";
    }
    setIssues(next);
    if (Object.keys(next).length)
      setTimeout(
        () => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
        0,
      );
    return Object.keys(next).length === 0;
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      submitting.current ||
      conflict ||
      !allowed ||
      !validate(event.currentTarget)
    )
      return;
    if (!review) {
      fail("");
      setReview(true);
      return;
    }
    submitting.current = true;
    pending(true);
    fail("");
    try {
      const saved = await api<JustificationRow>(
        action === "REGISTER"
          ? endpoint
          : `${endpoint}/${request!.id}/${action === "RESOLVE" ? "resolucion" : "recuperacion"}`,
        {
          method: action === "REGISTER" ? "POST" : "PATCH",
          body:
            action === "REGISTER"
              ? {
                  asistenciaId: row.asistencia_id,
                  asistenciaVersion: row.asistencia_version,
                  motivo: reason.trim(),
                  fechaPresentacion: date,
                }
              : {
                  estado: decision,
                  version: request!.version,
                  observacion: note.trim() || null,
                },
        },
      );
      onSaved(saved);
    } catch (e) {
      fail(errorText(e));
      setReview(false);
      if (e instanceof ApiError && e.status === 409) {
        setConflict(true);
        onConflict();
      }
    } finally {
      submitting.current = false;
      pending(false);
    }
  }
  if (action === "DETAIL" || !allowed)
    return (
      <Dialog title="Detalle de justificación" onClose={onClose}>
        {context}
        <Feedback tone="notice">
          Solo lectura ·{" "}
          {row.motivoSoloLectura ??
            "Consulta la solicitud y sus decisiones registradas."}
        </Feedback>
      </Dialog>
    );
  const labels = formLabels[action];
  const locked = busy || conflict;
  const dirty = Boolean(
    reason || decision || note || date !== today || conflict,
  );
  return (
    <FormDialog
      title={justificationActions[action]}
      context={context}
      review={review}
      reviewLabel={labels[0]}
      confirmLabel={labels[1]}
      reviewContent={
        <>
          <Facts
            emptyLabel="Sin observación"
            items={
              action === "REGISTER"
                ? [
                    ["Motivo", reason.trim()],
                    ["Fecha de presentación", sessionDate(date)],
                  ]
                : [
                    [
                      "Decisión",
                      justificationStates[decision as JustificationState],
                    ],
                    ["Observación", note.trim()],
                  ]
            }
          />
          <p className="notice">
            Se registrará esta acción con tu usuario y fecha. La marca original
            J y el historial se conservarán; el servidor recalculará la
            asistencia.
          </p>
        </>
      }
      busy={busy}
      dirty={dirty}
      blocked={conflict}
      error={error}
      onClose={onClose}
      onBack={() => setReview(false)}
      onSubmit={(event) => void submit(event)}
      onReload={conflict ? onReload : undefined}
      reloadLabel="Recargar justificación"
    >
      {action === "REGISTER" ? (
        <>
          <TextAreaField
            label="Motivo"
            value={reason}
            rows={4}
            maxLength={500}
            required
            autoFocus
            disabled={locked}
            error={issues.reason}
            hint="Motivo presentado por el estudiante. Máximo 500 caracteres."
            onChange={(event) => {
              setReason(event.target.value);
              setIssues((old) => ({ ...old, reason: "" }));
            }}
          />
          <InputField
            label="Fecha de presentación"
            type="date"
            value={date}
            min={row.fecha_sesion}
            max={today}
            required
            disabled={locked}
            error={issues.date}
            onChange={(event) => {
              setDate(event.target.value);
              setIssues((old) => ({ ...old, date: "" }));
            }}
          />
        </>
      ) : (
        <>
          <SelectField
            label={
              action === "RESOLVE" ? "Decisión" : "Resultado de recuperación"
            }
            value={decision}
            required
            autoFocus
            disabled={locked}
            error={issues.decision}
            onChange={(event) => {
              setDecision(event.target.value);
              setIssues((old) => ({ ...old, decision: "" }));
            }}
          >
            <option value="">Selecciona una decisión</option>
            {action === "RESOLVE" ? (
              <>
                <option value="APROBADA">Aprobar</option>
                <option value="RECHAZADA">Rechazar</option>
              </>
            ) : (
              <>
                <option value="RECUPERADA">Recuperada</option>
                <option value="NO_RECUPERADA">No recuperada</option>
              </>
            )}
          </SelectField>
          <TextAreaField
            label={
              action === "RESOLVE"
                ? "Observación de resolución"
                : "Observación de recuperación"
            }
            value={note}
            rows={3}
            maxLength={300}
            required={action === "RESOLVE"}
            disabled={locked}
            error={issues.note}
            hint={
              action === "RESOLVE"
                ? "Obligatoria para aprobar o rechazar. Máximo 300 caracteres."
                : "Opcional. Máximo 300 caracteres."
            }
            onChange={(event) => {
              setNote(event.target.value);
              setIssues((old) => ({ ...old, note: "" }));
            }}
          />
        </>
      )}
    </FormDialog>
  );
}
