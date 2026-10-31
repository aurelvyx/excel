import { useEffect, useState, type FormEvent } from "react";
import { api, errorText } from "../../shared/api";
import { Dialog } from "../../shared/Dialog";
import { FormDialog } from "../../shared/FormDialog";
import { Button } from "../../shared/ui/Button";
import { Facts } from "../../shared/ui/Facts";
import { Feedback, Loading } from "../../shared/ui/Feedback";
import { SelectField, TextAreaField } from "../../shared/ui/Field";
import { AttendanceCorrectionDialog } from "./AttendanceCorrectionDialog";
import { AttendanceHistoryDialog } from "./AttendanceHistoryDialog";
import type { JustificationDetail } from "./justification-model";
import {
  attendanceCodes,
  sessionDate,
  type AttendanceCode,
  type AttendancePageData,
  type AttendanceRow,
  type ClassSession,
  type SavedAttendance,
} from "./model";

export function AttendanceCellDetailDialog({
  groupId,
  student,
  session,
  currentCode,
  onClose,
  onSaved,
}: {
  groupId: string;
  student: AttendanceRow;
  session: ClassSession;
  currentCode: AttendanceCode | null;
  onClose: () => void;
  onSaved: (code: AttendanceCode) => void;
}) {
  const endpoint = `asistencia/grupos/${groupId}/sesiones/${session.id}/asistencias`;
  const [snapshot, setSnapshot] = useState<AttendancePageData>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [history, setHistory] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [justification, setJustification] = useState<JustificationDetail | null>(null);
  const [justificationError, setJustificationError] = useState("");
  const [code, setCode] = useState<AttendanceCode | "">(currentCode ?? "");
  const [observation, setObservation] = useState("");
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void (async () => {
      let after = "";
      let found: AttendancePageData | undefined;
      do {
        const query = new URLSearchParams({ limit: "100" });
        if (after) query.set("after", after);
        const page = await api<AttendancePageData>(`${endpoint}?${query}`);
        const row = page.items.find((item) => item.matricula_id === student.matricula_id);
        if (row) {
          found = { ...page, items: [row] };
          break;
        }
        after = page.nextCursor ?? "";
      } while (after);
      if (!found) throw new Error("No se encontró la matrícula en esta sesión.");
      if (active) {
        setSnapshot(found);
        const row = found.items[0]!;
        setCode(row.asistencia?.codigo ?? "");
        setObservation(row.asistencia?.observacion ?? "");
      }
    })().catch((reason: unknown) => {
      if (active) setError(errorText(reason));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [endpoint, student.matricula_id, revision]);

  const row = snapshot?.items[0];
  useEffect(() => {
    if (!row?.justificacionId) {
      setJustification(null);
      return;
    }
    let active = true;
    setJustificationError("");
    void api<JustificationDetail>(
      `asistencia/grupos/${groupId}/justificaciones/${row.justificacionId}`,
    ).then((detail) => {
      if (active) setJustification(detail);
    }).catch((reason: unknown) => {
      if (active) setJustificationError(errorText(reason));
    });
    return () => { active = false; };
  }, [groupId, row?.justificacionId]);

  if (loading) return <Dialog title="Detalle de asistencia" onClose={onClose}><Loading>Cargando marca y permisos…</Loading></Dialog>;
  if (error || !snapshot || !row) return <Dialog title="Detalle de asistencia" onClose={onClose}><Feedback onRetry={() => setRevision((value) => value + 1)}>{error || "No se pudo cargar el detalle."}</Feedback><Button onClick={onClose}>Cerrar</Button></Dialog>;

  if (history) return <AttendanceHistoryDialog row={row} session={snapshot.sesion} endpoint={endpoint} onClose={() => setHistory(false)} />;
  if (correcting && snapshot.grupo.cierre_asistencia) return (
    <AttendanceCorrectionDialog
      row={row}
      session={snapshot.sesion}
      closure={snapshot.grupo.cierre_asistencia}
      endpoint={endpoint}
      onClose={() => setCorrecting(false)}
      onSaved={async (response: SavedAttendance) => {
        const saved = response.items[0];
        if (saved) onSaved(saved.codigo);
      }}
      onConflict={() => setSaveError("El registro cambió. Recarga el detalle antes de corregirlo.")}
      onReload={() => { setCorrecting(false); setRevision((value) => value + 1); }}
    />
  );

  const canEdit = snapshot.puedeEditar && row.editable && !row.justificacionId;
  const canCorrect = snapshot.puedeCorregir && row.corregible && !!snapshot.grupo.cierre_asistencia;
  const context = <Facts items={[
    ["Estudiante", row.estudiante],
    ["Matrícula", row.codigo_matricula],
    ["Fecha", sessionDate(snapshot.sesion.fecha)],
    ["Marca", row.asistencia ? `${row.asistencia.codigo} · ${attendanceCodes[row.asistencia.codigo]}` : "Sin registrar"],
    ["Observación", row.asistencia?.observacion || "Sin observación"],
  ]} />;

  if (!canEdit) return (
    <Dialog title="Detalle de asistencia" onClose={onClose}>
      {context}
      {row.justificacionId && <section className="panel" aria-label="Justificación asociada">
        <h3>Justificación</h3>
        {justification ? <Facts items={[
          ["Motivo presentado", justification.justificacion?.motivo ?? "Sin motivo registrado"],
          ["Estado", justification.justificacion?.estado ?? row.justificacionEstado ?? "Sin solicitud"],
          ["Observación de resolución", justification.justificacion?.observacion_resolucion || "Sin observación"],
          ["Observación de recuperación", justification.justificacion?.observacion_recuperacion || "Sin observación"],
        ]} /> : <Feedback>{justificationError || "Cargando detalle de justificación…"}</Feedback>}
      </section>}
      {!snapshot.puedeEditar && <p className="readonly">{snapshot.motivoSoloLectura || "Esta asistencia está en modo de solo lectura."}</p>}
      <footer className="actions">
        {canCorrect && <Button variant="primary" onClick={() => setCorrecting(true)}>Corregir asistencia</Button>}
        {row.asistencia && <Button onClick={() => setHistory(true)}>Ver historial</Button>}
        <Button onClick={onClose}>Cerrar</Button>
      </footer>
    </Dialog>
  );

  const dirty = code !== (row.asistencia?.codigo ?? "") || observation !== (row.asistencia?.observacion ?? "");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!row || !code || busy) return;
    if (!review) { setReview(true); return; }
    setBusy(true);
    setSaveError("");
    try {
      const response = await api<SavedAttendance>(endpoint, {
        method: "PATCH",
        body: { registros: [{
          matriculaId: row.matricula_id,
          codigo: code,
          observacion: observation.trim() || null,
          version: row.asistencia?.version ?? null,
        }] },
      });
      const saved = response.items[0];
      if (saved) onSaved(saved.codigo);
    } catch (reason) {
      setSaveError(errorText(reason));
      setReview(false);
    } finally {
      setBusy(false);
    }
  }
  return (
    <FormDialog
      title="Detalle de asistencia"
      context={<>
        {context}
        {row.asistencia && <Button type="button" disabled={dirty || busy} onClick={() => setHistory(true)}>Ver historial</Button>}
      </>}
      review={review}
      reviewLabel="Revisar cambio"
      confirmLabel="Confirmar cambio"
      reviewContent={<><Facts items={[["Nueva marca", code ? `${code} · ${attendanceCodes[code]}` : "Sin seleccionar"], ["Observación", observation.trim() || "Sin observación"]]} /><p>Se guardará el cambio de esta fecha y se recalculará la asistencia del intento.</p></>}
      busy={busy}
      dirty={dirty}
      error={saveError}
      onClose={onClose}
      onBack={() => setReview(false)}
      onSubmit={(event) => void submit(event)}
    >
      <SelectField label="Marca" value={code} required onChange={(event) => setCode(event.target.value as AttendanceCode | "")}>
        <option value="">Selecciona una marca</option>
        {Object.entries(attendanceCodes).map(([value, label]) => <option key={value} value={value}>{value} · {label}</option>)}
      </SelectField>
      <TextAreaField label="Observación" value={observation} rows={2} maxLength={250} hint="Opcional · máximo 250 caracteres." onChange={(event) => setObservation(event.target.value)} />
    </FormDialog>
  );
}
