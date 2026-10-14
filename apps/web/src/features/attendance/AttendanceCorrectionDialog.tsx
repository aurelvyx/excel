import { useRef, useState, type FormEvent } from "react";
import { ApiError, api, errorText } from "../../shared/api";
import { FormDialog } from "../../shared/FormDialog";
import { Facts } from "../../shared/ui/Facts";
import { SelectField, TextAreaField } from "../../shared/ui/Field";
import {
  academicTime,
  attendanceCodes,
  sessionDate,
  type AttendanceClosureEvent,
  type AttendanceCode,
  type AttendanceRow,
  type ClassSession,
  type SavedAttendance,
} from "./model";

export function AttendanceCorrectionDialog({
  row,
  session,
  closure,
  endpoint,
  onClose,
  onSaved,
  onConflict,
  onReload,
}: {
  row: AttendanceRow;
  session: ClassSession;
  closure: AttendanceClosureEvent;
  endpoint: string;
  onClose: () => void;
  onSaved: (response: SavedAttendance) => Promise<void>;
  onConflict: () => void;
  onReload: () => void;
}) {
  const [code, setCode] = useState<AttendanceCode | "">(
    row.asistencia?.codigo ?? "",
  );
  const [note, setNote] = useState(row.asistencia?.observacion ?? "");
  const [reason, setReason] = useState("");
  const [review, confirm] = useState(false);
  const [busy, pending] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [error, fail] = useState("");
  const submitting = useRef(false);
  const dirty =
    code !== (row.asistencia?.codigo ?? "") ||
    note !== (row.asistencia?.observacion ?? "") ||
    Boolean(reason) ||
    conflict;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || conflict) return;
    const next: Record<string, string> = {};
    if (!code) next.code = "Selecciona una marca P, F, T o J.";
    if (note.trim().length > 250)
      next.note = "La observación admite hasta 250 caracteres.";
    if (!reason.trim()) next.reason = "Indica el motivo de la corrección.";
    else if (reason.trim().length > 400)
      next.reason = "El motivo admite hasta 400 caracteres.";
    setIssues(next);
    if (Object.keys(next).length) {
      const form = event.currentTarget;
      setTimeout(
        () => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
        0,
      );
      return;
    }
    if (!review) {
      confirm(true);
      return;
    }
    submitting.current = true;
    pending(true);
    fail("");
    try {
      const response = await api<SavedAttendance>(`${endpoint}/correccion`, {
        method: "PATCH",
        body: {
          matriculaId: row.matricula_id,
          codigo: code,
          observacion: note.trim() || null,
          version: row.asistencia?.version ?? null,
          motivo: reason.trim(),
          cierreId: closure.id,
        },
      });
      await onSaved(response);
    } catch (e) {
      fail(errorText(e));
      confirm(false);
      if (e instanceof ApiError && e.status === 409) {
        setConflict(true);
        onConflict();
      }
    } finally {
      submitting.current = false;
      pending(false);
    }
  }
  return (
    <FormDialog
      title="Corregir asistencia"
      context={
        <Facts
          emptyLabel="Sin registro"
          items={[
            ["Estudiante", row.estudiante],
            ["Matrícula", row.codigo_matricula],
            ["Intento", row.numero_intento],
            ["Fecha de clase", sessionDate(session.fecha)],
            ["Fecha del cierre", academicTime(closure.realizado_at)],
            [
              "Marca actual",
              row.asistencia
                ? `${row.asistencia.codigo} · ${attendanceCodes[row.asistencia.codigo]}`
                : "Pendiente",
            ],
            [
              "Observación actual",
              row.asistencia?.observacion || "Sin observación",
            ],
          ]}
        />
      }
      review={review}
      reviewLabel="Revisar corrección"
      confirmLabel="Confirmar corrección"
      reviewContent={
        <>
          <Facts
            emptyLabel="Sin observación"
            items={[
              [
                "Nueva marca",
                code ? `${code} · ${attendanceCodes[code]}` : "Pendiente",
              ],
              ["Nueva observación", note.trim()],
              ["Motivo de corrección", reason.trim()],
            ]}
          />
          <p className="notice">
            Se conservarán el valor anterior, el nuevo, tu usuario, la fecha y
            el motivo. La API recalculará la asistencia del intento. La
            corrección no reabre el registro ni modifica notas o resultados
            finales.
          </p>
        </>
      }
      busy={busy}
      dirty={dirty}
      blocked={conflict}
      error={error}
      onClose={onClose}
      onBack={() => confirm(false)}
      onSubmit={(event) => void submit(event)}
      onReload={conflict ? onReload : undefined}
      reloadLabel="Recargar asistencia"
    >
      <SelectField
        label="Nueva marca"
        value={code}
        required
        disabled={busy || conflict || !!row.justificacionId}
        error={issues.code}
        hint={
          row.justificacionId
            ? "La marca J conserva su expediente. Puedes corregir la observación sin sustituir la marca ni sus decisiones."
            : undefined
        }
        onChange={(event) => {
          setCode(event.target.value as AttendanceCode | "");
          setIssues((old) => ({ ...old, code: "" }));
        }}
      >
        <option value="">Selecciona una marca</option>
        {Object.entries(attendanceCodes).map(([value, label]) => (
          <option key={value} value={value}>
            {value} · {label}
          </option>
        ))}
      </SelectField>
      <TextAreaField
        label="Observación"
        value={note}
        rows={2}
        maxLength={250}
        disabled={busy || conflict}
        error={issues.note}
        hint="Opcional · máximo 250 caracteres."
        onChange={(event) => {
          setNote(event.target.value);
          setIssues((old) => ({ ...old, note: "" }));
        }}
      />
      <TextAreaField
        label="Motivo de corrección"
        value={reason}
        rows={3}
        maxLength={400}
        required
        disabled={busy || conflict}
        error={issues.reason}
        hint="Obligatorio · máximo 400 caracteres."
        onChange={(event) => {
          setReason(event.target.value);
          setIssues((old) => ({ ...old, reason: "" }));
        }}
      />
    </FormDialog>
  );
}
