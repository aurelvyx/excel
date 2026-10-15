import { useRef, useState } from "react";
import { ApiError, api, errorText } from "../../shared/api";
import { navigate } from "../../shared/navigation";
import { useApiQuery } from "../../shared/useApiQuery";
import { useUnsavedChanges } from "../../shared/useUnsavedChanges";
import { Button } from "../../shared/ui/Button";
import { DataTable } from "../../shared/ui/DataTable";
import { Facts } from "../../shared/ui/Facts";
import { Feedback, Loading } from "../../shared/ui/Feedback";
import { InputField, SelectField } from "../../shared/ui/Field";
import { ListPanel } from "../../shared/ui/ListPanel";
import { PageHeading } from "../../shared/ui/PageHeading";
import { Pagination } from "../../shared/ui/Pagination";
import { StatusBadge } from "../../shared/ui/StatusBadge";
import {
  EnrollmentAttempt,
  StudentIdentity,
} from "../../shared/ui/AcademicCells";
import { CaptureToolbar } from "../../shared/ui/CaptureToolbar";
import { GroupContext } from "./GroupContext";
import { AttendanceSummary } from "./AttendanceSummary";
import { AttendanceCorrectionDialog } from "./AttendanceCorrectionDialog";
import { AttendanceHistoryDialog } from "./AttendanceHistoryDialog";
import {
  justificationStates,
  type JustificationState,
} from "./justification-model";
import {
  attendanceCodes,
  sessionDate,
  sessionStates,
  sessionTime,
  type AttendanceCode,
  type AttendancePageData,
  type AttendanceRow,
  type SavedAttendance,
} from "./model";

export function AttendancePage({
  groupId,
  sessionId,
  query,
}: {
  groupId: string;
  sessionId: string;
  query: URLSearchParams;
}) {
  const after = query.get("after") ?? "";
  const path = `/asistencia/grupos/${groupId}/sesiones/${sessionId}`;
  const endpoint = `asistencia/grupos/${groupId}/sesiones/${sessionId}/asistencias`;
  const search = new URLSearchParams({ limit: "20" });
  if (after) search.set("after", after);
  const { data, error, loading, reload } = useApiQuery<AttendancePageData>(
    `${endpoint}?${search}`,
  );
  if (!loading && !error && data)
    return (
      <AttendanceMatrix
        key={after}
        initial={data}
        path={path}
        endpoint={endpoint}
        queryPath={`${endpoint}?${search}`}
        after={after}
        reload={reload}
      />
    );
  return (
    <section>
      <a href={`#/asistencia/grupos/${groupId}`}>← Volver a sesiones</a>
      <AttendanceHeading />
      {loading ? (
        <Loading>Cargando asistencia…</Loading>
      ) : (
        <Feedback onRetry={reload}>{error}</Feedback>
      )}
    </section>
  );
}

function AttendanceHeading() {
  return (
    <PageHeading
      eyebrow="Asistencia"
      title="Registro de asistencia"
      description="Registra P, F, T o J para cada matrícula de la sesión seleccionada."
    />
  );
}

type Draft = { codigo: AttendanceCode | ""; observacion: string };
function recorded(row: AttendanceRow): Draft {
  return {
    codigo: row.asistencia?.codigo ?? "",
    observacion: row.asistencia?.observacion ?? "",
  };
}
function AttendanceMatrix({
  initial,
  path,
  endpoint,
  queryPath,
  after,
  reload,
}: {
  initial: AttendancePageData;
  path: string;
  endpoint: string;
  queryPath: string;
  after: string;
  reload: () => void;
}) {
  const [snapshot, setSnapshot] = useState(initial);
  const rows = snapshot.items;
  const session = snapshot.sesion;
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [error, fail] = useState("");
  const [success, notify] = useState("");
  const [conflict, setConflict] = useState(false);
  const [busy, pending] = useState(false);
  const [summaryCurrent, setSummaryCurrent] = useState(true);
  const [summaryError, failSummary] = useState("");
  const [correcting, setCorrecting] = useState<AttendanceRow | null>(null);
  const [history, showHistory] = useState<AttendanceRow | null>(null);
  const saving = useRef(false);
  const changedRows = Object.keys(drafts).length;
  const dirty = changedRows > 0;
  const guard = useUnsavedChanges(dirty, busy);
  const canEdit = snapshot.puedeEditar;
  function change(row: AttendanceRow, patch: Partial<Draft>) {
    notify("");
    setIssues((old) => ({ ...old, [row.matricula_id]: "" }));
    setDrafts((old) => {
      const base = recorded(row);
      const current = { ...(old[row.matricula_id] ?? base), ...patch };
      const next = { ...old };
      if (
        base.codigo === current.codigo &&
        base.observacion === current.observacion
      )
        delete next[row.matricula_id];
      else next[row.matricula_id] = current;
      return next;
    });
  }
  function markPresent() {
    for (const row of rows)
      if (canEdit && row.editable && !row.justificacionId)
        change(row, { codigo: "P" });
  }
  async function applySaved(response: SavedAttendance, message: string) {
    const saved = new Map(
      response.items.map((item) => [item.matricula_id, item]),
    );
    const summaries = new Map(
      (response.resumenes ?? []).map((item) => [
        item.matriculaId,
        item.resumenAsistencia,
      ]),
    );
    setSnapshot((old) => ({
      ...old,
      sesion: response.sesion,
      items: old.items.map((row) =>
        saved.has(row.matricula_id)
          ? {
              ...row,
              asistencia: saved.get(row.matricula_id)!,
              resumenAsistencia:
                summaries.get(row.matricula_id) ?? row.resumenAsistencia,
            }
          : row,
      ),
    }));
    setDrafts({});
    notify(message);
    setSummaryCurrent(false);
    failSummary("");
    // La sesión realizada cambia el denominador de todas las filas; una
    // corrección también puede modificar el resumen del intento consultado.
    try {
      setSnapshot(await api<AttendancePageData>(queryPath));
      setSummaryCurrent(true);
    } catch {
      failSummary(
        "La asistencia se guardó, pero no se pudo actualizar el resumen. Recarga la asistencia para consultar los cálculos vigentes.",
      );
    }
  }
  async function save() {
    if (saving.current || !dirty || !canEdit || conflict) return;
    const changes = rows.filter(
      (row) => row.editable && drafts[row.matricula_id],
    );
    const next: Record<string, string> = {};
    for (const row of changes) {
      const value = drafts[row.matricula_id];
      if (!value.codigo)
        next[row.matricula_id] = "Selecciona P, F, T o J antes de guardar.";
    }
    setIssues(next);
    if (Object.keys(next).length) {
      setTimeout(
        () =>
          document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
        0,
      );
      return;
    }
    saving.current = true;
    pending(true);
    fail("");
    notify("");
    try {
      const response = await api<SavedAttendance>(endpoint, {
        method: "PATCH",
        body: {
          registros: changes.map((row) => ({
            matriculaId: row.matricula_id,
            codigo: drafts[row.matricula_id].codigo,
            observacion: drafts[row.matricula_id].observacion.trim() || null,
            version: row.asistencia?.version ?? null,
          })),
        },
      });
      await applySaved(response, "Asistencia guardada.");
    } catch (e) {
      fail(errorText(e));
      if (e instanceof ApiError && e.status === 409) {
        setConflict(true);
        setSummaryCurrent(false);
      }
    } finally {
      saving.current = false;
      pending(false);
    }
  }
  return (
    <section>
      <a href={`#/asistencia/grupos/${snapshot.grupo.id}`}>
        ← Volver a sesiones
      </a>
      <AttendanceHeading />
      <GroupContext group={snapshot.grupo} />
      <p>
        <a href={`#/asistencia/grupos/${snapshot.grupo.id}/cierre`}>
          Cierre de asistencia
        </a>
      </p>
      <section
        className="panel enrollment-context"
        aria-label="Sesión seleccionada"
      >
        <Facts
          items={[
            ["Fecha de clase", sessionDate(session.fecha)],
            ["Horario", sessionTime(session.hora_inicio, session.hora_fin)],
            ["Estado de la sesión", sessionStates[session.estado]],
          ]}
        />
      </section>
      {!canEdit && (
        <p className="readonly">
          Solo lectura ·{" "}
          {snapshot.motivoSoloLectura ??
            "Tu cuenta puede consultar la asistencia de esta sesión."}
        </p>
      )}
      {canEdit && session.estado === "PROGRAMADA" && (
        <p className="notice">
          Guardar asistencia confirma que la clase se realizó. Las matrículas
          pendientes de marcar seguirán pendientes.
        </p>
      )}
      <Feedback tone="success">{success}</Feedback>
      <Feedback tone="notice">{summaryError}</Feedback>
      <Feedback>{error}</Feedback>
      {conflict && (
        <p className="notice">
          La captura se conserva. Recarga la asistencia para revisar los
          registros vigentes antes de continuar.
        </p>
      )}
      <p className="help">
        Resumen de asistencia guardada por intento: incluye las sesiones
        realizadas del grupo{" "}
        {snapshot.grupo.cierre_asistencia
          ? "hasta el cierre de asistencia"
          : "hasta hoy en Lima"}
        . Las programadas y canceladas no computan. Los cambios sin guardar no
        modifican este resumen.
      </p>
      <ListPanel
        loading={false}
        loadingLabel="Cargando asistencia…"
        error=""
        onRetry={reload}
        empty={!rows.length}
        emptyDescription="No hay matrículas disponibles para esta sesión en esta página."
        filters={
          <CaptureToolbar
            changes={changedRows}
            busy={busy}
            reloadLabel="Recargar asistencia"
            onReload={() => guard.request(reload)}
          >
            {canEdit && (
              <Button
                disabled={
                  busy ||
                  conflict ||
                  !rows.some((row) => row.editable && !row.justificacionId)
                }
                onClick={markPresent}
              >
                Marcar presentes
              </Button>
            )}
          </CaptureToolbar>
        }
        pagination={
          <Pagination
            count={rows.length}
            after={after}
            nextCursor={snapshot.nextCursor}
            onChange={(cursor) =>
              guard.request(
                () => navigate(cursor ? `${path}?after=${cursor}` : path),
                true,
              )
            }
          />
        }
      >
        <DataTable
          caption="Asistencia de la sesión"
          rows={rows}
          rowKey={(row) => row.matricula_id}
          columns={[
            {
              key: "estudiante",
              header: "Estudiante",
              cell: (row) => (
                <StudentIdentity
                  name={row.estudiante}
                  documentType={row.tipo_documento}
                  documentNumber={row.numero_documento}
                />
              ),
            },
            {
              key: "matricula",
              header: "Matrícula / intento",
              cell: (row) => (
                <EnrollmentAttempt
                  code={row.codigo_matricula}
                  attempt={row.numero_intento}
                  state={row.estado_matricula}
                />
              ),
            },
            {
              key: "marca",
              header: "Asistencia",
              className: "attendance-mark",
              cell: (row) =>
                canEdit && row.editable ? (
                  <SelectField
                    label={`Asistencia de ${row.estudiante}`}
                    id={`attendance-${row.matricula_id}`}
                    value={(drafts[row.matricula_id] ?? recorded(row)).codigo}
                    disabled={busy || conflict || !!row.justificacionId}
                    hint={
                      row.justificacionId
                        ? "Esta marca J tiene una solicitud registrada y se conserva como evidencia."
                        : undefined
                    }
                    error={issues[row.matricula_id]}
                    onChange={(event) =>
                      change(row, {
                        codigo: event.target.value as AttendanceCode | "",
                      })
                    }
                  >
                    <option value="" disabled={!!row.asistencia}>
                      Pendiente
                    </option>
                    {Object.entries(attendanceCodes).map(([code, label]) => (
                      <option key={code} value={code}>
                        {code} · {label}
                      </option>
                    ))}
                  </SelectField>
                ) : (
                  <StatusBadge inactive={!row.asistencia}>
                    {row.asistencia
                      ? `${row.asistencia.codigo} · ${attendanceCodes[row.asistencia.codigo]}`
                      : "Pendiente"}
                  </StatusBadge>
                ),
            },
            {
              key: "observacion",
              header: "Observación",
              className: "attendance-observation",
              cell: (row) =>
                canEdit && row.editable ? (
                  <InputField
                    label={`Observación de ${row.estudiante}`}
                    id={`attendance-note-${row.matricula_id}`}
                    value={
                      (drafts[row.matricula_id] ?? recorded(row)).observacion
                    }
                    maxLength={250}
                    disabled={busy || conflict}
                    hint="Opcional · máximo 250 caracteres"
                    onChange={(event) =>
                      change(row, { observacion: event.target.value })
                    }
                  />
                ) : (
                  row.asistencia?.observacion || "—"
                ),
            },
            {
              key: "resumen",
              header: "Resumen del intento",
              className: "attendance-calculation",
              cell: (row) => (
                <AttendanceSummary
                  summary={row.resumenAsistencia}
                  label={`Resumen de asistencia de ${row.estudiante}`}
                  compact
                  stale={!summaryCurrent}
                />
              ),
            },
            {
              key: "registro",
              header: "Registro",
              className: "attendance-status",
              cell: (row) => (
                <>
                  {drafts[row.matricula_id]
                    ? "Sin guardar"
                    : row.asistencia
                      ? "Registrado"
                      : "Pendiente"}
                  {row.asistencia?.codigo === "J" && (
                    <>
                      <small className="attendance-document">
                        {
                          justificationStates[
                            (row.justificacionEstado as JustificationState) ??
                              "SIN_SOLICITUD"
                          ]
                        }
                      </small>
                      <a
                        href={`#/asistencia/grupos/${snapshot.grupo.id}/justificaciones?q=${encodeURIComponent(row.numero_documento)}`}
                      >
                        Gestionar justificación
                      </a>
                    </>
                  )}
                </>
              ),
            },
            {
              key: "historial",
              header: "Acciones",
              className: "row-actions",
              cell: (row) => (
                <>
                  {snapshot.puedeCorregir && row.corregible && (
                    <Button
                      variant="link"
                      disabled={busy || conflict || !summaryCurrent}
                      onClick={() => setCorrecting(row)}
                    >
                      Corregir asistencia
                    </Button>
                  )}
                  <Button
                    variant="link"
                    disabled={busy}
                    onClick={() => showHistory(row)}
                  >
                    Ver historial de asistencia
                  </Button>
                </>
              ),
            },
          ]}
        />
      </ListPanel>
      {canEdit && (
        <footer className="actions">
          <Button
            variant="primary"
            disabled={!dirty || conflict}
            busy={busy}
            busyLabel="Guardando asistencia…"
            onClick={() => void save()}
          >
            Guardar asistencia
          </Button>
        </footer>
      )}
      {guard.confirmation}
      {correcting && snapshot.grupo.cierre_asistencia && (
        <AttendanceCorrectionDialog
          row={correcting}
          session={session}
          closure={snapshot.grupo.cierre_asistencia}
          endpoint={endpoint}
          onClose={() => setCorrecting(null)}
          onSaved={async (response) => {
            setCorrecting(null);
            pending(true);
            fail("");
            try {
              await applySaved(
                response,
                "Corrección de asistencia registrada.",
              );
            } finally {
              pending(false);
            }
          }}
          onConflict={() => setSummaryCurrent(false)}
          onReload={() => {
            setCorrecting(null);
            reload();
          }}
        />
      )}
      {history && (
        <AttendanceHistoryDialog
          row={history}
          session={session}
          endpoint={endpoint}
          onClose={() => showHistory(null)}
        />
      )}
    </section>
  );
}
