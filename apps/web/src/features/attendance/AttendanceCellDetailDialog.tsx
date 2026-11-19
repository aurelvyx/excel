import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, api, errorText } from "../../shared/api";
import { Dialog } from "../../shared/Dialog";
import { FormDialog } from "../../shared/FormDialog";
import { Button } from "../../shared/ui/Button";
import { Facts } from "../../shared/ui/Facts";
import { Feedback, Loading } from "../../shared/ui/Feedback";
import { SelectField, TextAreaField } from "../../shared/ui/Field";
import { useApiQuery } from "../../shared/useApiQuery";
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
  sessionPath,
  onClose,
  onSaved,
}: {
  groupId: string;
  student: AttendanceRow;
  session: ClassSession;
  currentCode: AttendanceCode | null;
  sessionPath: string;
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
  const [code, setCode] = useState<AttendanceCode | "">(currentCode ?? "");
  const [observation, setObservation] = useState("");
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [conflict, block] = useState(false);
  const saving = useRef(false);
  function reloadDetail() {
    setLoading(true);
    setError("");
    setRevision((value) => value + 1);
  }

  useEffect(() => {
    let active = true;
    const abort = new AbortController();
    void (async () => {
      let after = "";
      let found: AttendancePageData | undefined;
      do {
        const query = new URLSearchParams({ limit: "100" });
        if (after) query.set("after", after);
        const page = await api<AttendancePageData>(`${endpoint}?${query}`, {
          signal: abort.signal,
        });
        const row = page.items.find(
          (item) => item.matricula_id === student.matricula_id,
        );
        if (row) {
          found = { ...page, items: [row] };
          break;
        }
        after = page.nextCursor ?? "";
      } while (after);
      if (!found)
        throw new Error("No se encontró la matrícula en esta sesión.");
      if (active) {
        setSnapshot(found);
        const row = found.items[0]!;
        setCode(row.asistencia?.codigo ?? "");
        setObservation(row.asistencia?.observacion ?? "");
        block(false);
        setSaveError("");
      }
    })()
      .catch((reason: unknown) => {
        if (active) setError(errorText(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      abort.abort();
    };
  }, [endpoint, student.matricula_id, revision]);

  const row = snapshot?.items[0];
  if (loading)
    return (
      <Dialog title="Detalle de asistencia" onClose={onClose}>
        <Loading>Cargando marca y permisos…</Loading>
      </Dialog>
    );
  if (error || !snapshot || !row)
    return (
      <Dialog title="Detalle de asistencia" onClose={onClose}>
        <Feedback onRetry={reloadDetail}>
          {error || "No se pudo cargar el detalle."}
        </Feedback>
        <Button onClick={onClose}>Cerrar</Button>
      </Dialog>
    );

  if (history)
    return (
      <AttendanceHistoryDialog
        row={row}
        session={snapshot.sesion}
        endpoint={endpoint}
        onClose={() => setHistory(false)}
      />
    );
  if (correcting && snapshot.grupo.cierre_asistencia)
    return (
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
        onConflict={() =>
          setSaveError(
            "El registro cambió. Recarga el detalle antes de corregirlo.",
          )
        }
        onReload={() => {
          setCorrecting(false);
          reloadDetail();
        }}
      />
    );

  const canEdit = snapshot.puedeEditar && row.editable && !row.justificacionId;
  const canCorrect =
    snapshot.puedeCorregir &&
    row.corregible &&
    !!snapshot.grupo.cierre_asistencia;
  const context = (
    <>
      <Facts
        items={[
          ["Estudiante", row.estudiante],
          ["Matrícula", row.codigo_matricula],
          ["Fecha", sessionDate(snapshot.sesion.fecha)],
          [
            "Marca",
            row.asistencia
              ? `${row.asistencia.codigo} · ${attendanceCodes[row.asistencia.codigo]}`
              : "Sin registrar",
          ],
          ["Observación", row.asistencia?.observacion || "Sin observación"],
        ]}
      />
      <a href={`#${sessionPath}`}>Abrir registro de la sesión</a>
    </>
  );

  if (!canEdit)
    return (
      <Dialog title="Detalle de asistencia" onClose={onClose}>
        {context}
        {row.justificacionId && (
          <JustificationEvidence groupId={groupId} id={row.justificacionId} />
        )}
        {!snapshot.puedeEditar && (
          <p className="readonly">
            {snapshot.motivoSoloLectura ||
              "Esta asistencia está en modo de solo lectura."}
          </p>
        )}
        <footer className="actions">
          {canCorrect && (
            <Button variant="primary" onClick={() => setCorrecting(true)}>
              Corregir asistencia
            </Button>
          )}
          {row.asistencia && (
            <Button onClick={() => setHistory(true)}>Ver historial</Button>
          )}
          <Button onClick={onClose}>Cerrar</Button>
        </footer>
      </Dialog>
    );

  const dirty =
    code !== (row.asistencia?.codigo ?? "") ||
    observation !== (row.asistencia?.observacion ?? "");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!row || busy || saving.current || conflict) return;
    if (!code) {
      setSaveError("Selecciona una marca de asistencia.");
      return;
    }
    if (observation.length > 250) {
      setSaveError("La observación admite hasta 250 caracteres.");
      return;
    }
    if (!review) {
      setReview(true);
      return;
    }
    setBusy(true);
    saving.current = true;
    setSaveError("");
    try {
      const response = await api<SavedAttendance>(endpoint, {
        method: "PATCH",
        body: {
          registros: [
            {
              matriculaId: row.matricula_id,
              codigo: code,
              observacion: observation.trim() || null,
              version: row.asistencia?.version ?? null,
            },
          ],
        },
      });
      const saved = response.items[0];
      if (saved) onSaved(saved.codigo);
    } catch (reason) {
      setSaveError(errorText(reason));
      setReview(false);
      if (reason instanceof ApiError && [403, 409].includes(reason.status))
        block(true);
    } finally {
      setBusy(false);
      saving.current = false;
    }
  }
  return (
    <FormDialog
      title="Detalle de asistencia"
      context={
        <>
          {context}
          {row.asistencia && (
            <Button
              type="button"
              disabled={dirty || busy}
              onClick={() => setHistory(true)}
            >
              Ver historial
            </Button>
          )}
        </>
      }
      review={review}
      reviewLabel="Revisar cambio"
      confirmLabel="Confirmar cambio"
      reviewContent={
        <>
          <Facts
            items={[
              [
                "Nueva marca",
                code ? `${code} · ${attendanceCodes[code]}` : "Sin seleccionar",
              ],
              ["Observación", observation.trim() || "Sin observación"],
            ]}
          />
          <p>
            Se guardará el cambio de esta fecha y se recalculará la asistencia
            del intento.
          </p>
        </>
      }
      busy={busy}
      dirty={dirty}
      blocked={conflict}
      onReload={
        conflict
          ? () => {
              setReview(false);
              reloadDetail();
            }
          : undefined
      }
      reloadLabel="Recargar detalle"
      error={saveError}
      onClose={onClose}
      onBack={() => setReview(false)}
      onSubmit={(event) => void submit(event)}
    >
      <SelectField
        label="Marca"
        value={code}
        required
        onChange={(event) => setCode(event.target.value as AttendanceCode | "")}
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
        value={observation}
        rows={2}
        maxLength={250}
        hint="Opcional · máximo 250 caracteres."
        onChange={(event) => setObservation(event.target.value)}
      />
    </FormDialog>
  );
}

function JustificationEvidence({
  groupId,
  id,
}: {
  groupId: string;
  id: string;
}) {
  const { data, error, loading, reload } = useApiQuery<JustificationDetail>(
    `asistencia/grupos/${groupId}/justificaciones/${id}`,
  );
  return (
    <section className="panel" aria-label="Justificación asociada">
      <h3>Justificación</h3>
      {loading ? (
        <Loading>Cargando justificación…</Loading>
      ) : error || !data ? (
        <Feedback onRetry={reload}>
          {error || "No se pudo consultar la justificación."}
        </Feedback>
      ) : (
        <Facts
          items={[
            ["Motivo presentado", data.justificacion?.motivo],
            ["Estado", data.justificacion?.estado],
            [
              "Observación de resolución",
              data.justificacion?.observacion_resolucion || "Sin observación",
            ],
            [
              "Observación de recuperación",
              data.justificacion?.observacion_recuperacion || "Sin observación",
            ],
          ]}
        />
      )}
    </section>
  );
}
