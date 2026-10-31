import { useMemo, useRef, useState } from "react";
import { ApiError, api, errorText } from "../../shared/api";
import { navigate } from "../../shared/navigation";
import { useApiQuery } from "../../shared/useApiQuery";
import { useUnsavedChanges } from "../../shared/useUnsavedChanges";
import { Dialog } from "../../shared/Dialog";
import { Button } from "../../shared/ui/Button";
import { DataTable } from "../../shared/ui/DataTable";
import { Facts } from "../../shared/ui/Facts";
import { Feedback, Loading } from "../../shared/ui/Feedback";
import { ListPanel } from "../../shared/ui/ListPanel";
import { PageHeading } from "../../shared/ui/PageHeading";
import { Pagination } from "../../shared/ui/Pagination";
import { EnrollmentAttempt } from "../../shared/ui/AcademicCells";
import { CaptureToolbar } from "../../shared/ui/CaptureToolbar";
import { GroupContext } from "./GroupContext";
import { AttendanceCorrectionDialog } from "./AttendanceCorrectionDialog";
import { AttendanceHistoryDialog } from "./AttendanceHistoryDialog";
import { safeAttendanceReturnTo } from "./navigation";
import "../academic/academic.css";
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
  const fromMatrix = query.get("origen") === "matriz";
  const fromJustifications = query.get("origen") === "justificaciones";
  const requestedMonth = query.get("mes") ?? "";
  const matrixMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth)
    ? requestedMonth
    : "";
  const originReturnTo = safeAttendanceReturnTo(query.get("retorno"), groupId);
  const returnParams = new URLSearchParams();
  if (fromMatrix) {
    returnParams.set("origen", "matriz");
    if (matrixMonth) returnParams.set("mes", matrixMonth);
  }
  if (originReturnTo) returnParams.set("retorno", originReturnTo);
  const returnPathBase = fromMatrix
    ? `/asistencia/grupos/${groupId}/matriz`
    : `/asistencia/grupos/${groupId}`;
  const returnPath =
    (fromJustifications && originReturnTo) ||
    `${returnPathBase}${returnParams.size ? `?${returnParams}` : ""}`;
  const returnLabel = fromMatrix
    ? "Volver a matriz"
    : fromJustifications
      ? "Volver a justificaciones"
      : "Volver a sesiones";
  const routeContext = new URLSearchParams();
  if (fromMatrix) {
    routeContext.set("origen", "matriz");
    if (matrixMonth) routeContext.set("mes", matrixMonth);
  }
  if (fromJustifications) routeContext.set("origen", "justificaciones");
  if (originReturnTo) routeContext.set("retorno", originReturnTo);
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
        returnPath={returnPath}
        returnLabel={returnLabel}
        routeContext={routeContext.toString()}
        reload={reload}
      />
    );
  return (
    <section>
      <a href={`#${returnPath}`}>← {returnLabel}</a>
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
  returnPath,
  returnLabel,
  routeContext,
  reload,
}: {
  initial: AttendancePageData;
  path: string;
  endpoint: string;
  queryPath: string;
  after: string;
  returnPath: string;
  returnLabel: string;
  routeContext: string;
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
  const [studentDetail, showStudentDetail] = useState<AttendanceRow | null>(
    null,
  );
  const saving = useRef(false);
  const changedRows = Object.keys(drafts).length;
  const dirty = changedRows > 0;
  const counts = useMemo(() => {
    let p = 0;
    let t = 0;
    let f = 0;
    let j = 0;
    let pendingCount = 0;
    for (const r of rows) {
      const currentCode = (drafts[r.matricula_id] ?? recorded(r)).codigo;
      if (currentCode === "P") p++;
      else if (currentCode === "T") t++;
      else if (currentCode === "F") f++;
      else if (currentCode === "J") j++;
      else pendingCount++;
    }
    return { p, t, f, j, pending: pendingCount };
  }, [rows, drafts]);
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
      <a href={`#${returnPath}`}>
        ← {returnLabel}
      </a>
      <AttendanceHeading />
      <GroupContext group={snapshot.grupo} />
      <p>
        <a href={`#/asistencia/grupos/${snapshot.grupo.id}/cierre`}>
          Cierre de asistencia
        </a>
        {" · "}
        <a href={`#/evaluacion/grupos/${snapshot.grupo.id}/acta`}>
          Resultados y correcciones de acta
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
      {/* Barra en vivo de marcas de asistencia */}
      <div className="attendance-live-bar">
        <div className="attendance-counters">
          <span className="att-counter-pill p" title="Estudiantes Presentes">
            🟢 Presentes: {counts.p}
          </span>
          <span className="att-counter-pill t" title="Estudiantes con Tardanza">
            🟡 Tardanzas: {counts.t}
          </span>
          <span className="att-counter-pill f" title="Estudiantes con Falta">
            🔴 Faltas: {counts.f}
          </span>
          <span className="att-counter-pill j" title="Estudiantes con Justificación">
            🔵 Justificados: {counts.j}
          </span>
          {counts.pending > 0 && (
            <span className="att-counter-pill pending" title="Pendientes de marcar">
              ⚪ Sin marcar: {counts.pending}
            </span>
          )}
        </div>
        {canEdit && (
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
            <Button
              disabled={
                busy ||
                conflict ||
                !rows.some((row) => row.editable && !row.justificacionId)
              }
              onClick={markPresent}
            >
              ✓ Marcar todos presentes (P)
            </Button>
            {dirty && (
              <Button
                variant="primary"
                disabled={conflict}
                busy={busy}
                busyLabel="Guardando…"
                onClick={() => void save()}
              >
                💾 Guardar asistencia ({changedRows})
              </Button>
            )}
          </div>
        )}
      </div>

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
          />
        }
        pagination={
          <Pagination
            count={rows.length}
            after={after}
            nextCursor={snapshot.nextCursor}
            onChange={(cursor) =>
              guard.request(
                () => {
                  const params = new URLSearchParams(routeContext);
                  if (cursor) params.set("after", cursor);
                  navigate(`${path}${params.size ? `?${params}` : ""}`);
                },
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
              cell: (row) => {
                const names = row.estudiante;
                const parts = names.split(" ");
                const initials = (parts[0]?.[0] || "") + (parts[1]?.[0] || "");
                return (
                  <div className="att-student-cell">
                    <div className="att-student-avatar">
                      {initials.toUpperCase() || "E"}
                    </div>
                    <div>
                      <span className="att-student-name">{names}</span>
                      <span className="att-student-doc">
                        {row.tipo_documento} {row.numero_documento}
                      </span>
                    </div>
                  </div>
                );
              },
            },
            {
              key: "matricula",
              header: "Matrícula",
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
              header: "Marca de asistencia",
              className: "attendance-mark",
              cell: (row) => {
                const currentCode = (drafts[row.matricula_id] ?? recorded(row)).codigo;
                const isLocked = !canEdit || !row.editable || busy || conflict || !!row.justificacionId;
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                    <div className="attendance-toggle-group">
                      <button
                        type="button"
                        className={`att-btn p ${currentCode === "P" ? "active" : ""}`}
                        title="Marcar Presente (P)"
                        aria-label={`Presente para ${row.estudiante}`}
                        disabled={isLocked}
                        onClick={() => change(row, { codigo: "P" })}
                      >
                        P
                      </button>
                      <button
                        type="button"
                        className={`att-btn t ${currentCode === "T" ? "active" : ""}`}
                        title="Marcar Tardanza (T)"
                        aria-label={`Tardanza para ${row.estudiante}`}
                        disabled={isLocked}
                        onClick={() => change(row, { codigo: "T" })}
                      >
                        T
                      </button>
                      <button
                        type="button"
                        className={`att-btn f ${currentCode === "F" ? "active" : ""}`}
                        title="Marcar Falta (F)"
                        aria-label={`Falta para ${row.estudiante}`}
                        disabled={isLocked}
                        onClick={() => change(row, { codigo: "F" })}
                      >
                        F
                      </button>
                      <button
                        type="button"
                        className={`att-btn j ${currentCode === "J" ? "active" : ""}`}
                        title="Marcar Justificado (J)"
                        aria-label={`Justificado para ${row.estudiante}`}
                        disabled={isLocked}
                        onClick={() => change(row, { codigo: "J" })}
                      >
                        J
                      </button>
                    </div>
                    {issues[row.matricula_id] && (
                      <span style={{ fontSize: "0.688rem", color: "#dc2626", fontWeight: 600 }}>
                        {issues[row.matricula_id]}
                      </span>
                    )}
                    {row.justificacionId && (
                      <span style={{ fontSize: "0.688rem", color: "#0284c7", fontWeight: 600 }}>
                        Justificación oficial
                      </span>
                    )}
                  </div>
                );
              },
            },
            {
              key: "observacion",
              header: "Observación",
              className: "attendance-observation",
              cell: (row) =>
                canEdit && row.editable ? (
                  <input
                    type="text"
                    placeholder="Obs / nota..."
                    value={(drafts[row.matricula_id] ?? recorded(row)).observacion}
                    maxLength={250}
                    disabled={busy || conflict}
                    onChange={(event) =>
                      change(row, { observacion: event.target.value })
                    }
                    style={{
                      width: "100%",
                      minWidth: "130px",
                      maxWidth: "200px",
                      padding: "0.35rem 0.6rem",
                      fontSize: "0.813rem",
                      borderRadius: "0.5rem",
                      border: "1px solid #cbd5e1",
                    }}
                  />
                ) : (
                  <span style={{ color: "#64748b", fontSize: "0.813rem" }}>
                    {row.asistencia?.observacion || "—"}
                  </span>
                ),
            },
            {
              key: "resumen",
              header: "Límite de inasistencias",
              className: "attendance-calculation",
              cell: (row) => {
                const summary = row.resumenAsistencia;
                const limitExceeded =
                  summary?.excedeLimite === true ||
                  summary?.condicion === "RETIRADO_INASISTENCIA";
                const inasistenciaPct = summary?.inasistenciaPct;
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "0.15rem 0.45rem",
                        borderRadius: "9999px",
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        width: "fit-content",
                        background: limitExceeded ? "#fef2f2" : "#ecfdf5",
                        color: limitExceeded ? "#991b1b" : "#065f46",
                        border: `1px solid ${limitExceeded ? "#fecaca" : "#a7f3d0"}`,
                      }}
                    >
                      {limitExceeded ? "DPI (> 20%)" : "Normal"}
                    </span>
                    {inasistenciaPct != null && (
                      <span style={{ fontSize: "0.72rem", color: "#64748b" }}>
                        Inasistencia: {inasistenciaPct}%
                      </span>
                    )}
                    <button
                      type="button"
                      style={{
                        background: "none",
                        border: "none",
                        color: "#007a3d",
                        textDecoration: "underline",
                        fontSize: "0.72rem",
                        padding: 0,
                        cursor: "pointer",
                        textAlign: "left",
                        width: "fit-content",
                      }}
                      onClick={() => showStudentDetail(row)}
                    >
                      Ver desglose
                    </button>
                  </div>
                );
              },
            },
            {
              key: "registro",
              header: "Estado",
              className: "attendance-status",
              cell: (row) => (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                  <span
                    style={{
                      fontSize: "0.813rem",
                      fontWeight: 600,
                      color: drafts[row.matricula_id]
                        ? "#d97706"
                        : row.asistencia
                          ? "#059669"
                          : "#64748b",
                    }}
                  >
                    {drafts[row.matricula_id]
                      ? "Por guardar"
                      : row.asistencia
                        ? "✓ Guardado"
                        : "Pendiente"}
                  </span>
                  {row.asistencia?.codigo === "J" && (
                    <small style={{ fontSize: "0.688rem", color: "#0284c7" }}>
                      {
                        justificationStates[
                          (row.justificacionEstado as JustificationState) ??
                            "SIN_SOLICITUD"
                        ]
                      }
                    </small>
                  )}
                </div>
              ),
            },
            {
              key: "historial",
              header: "Acciones",
              className: "row-actions",
              cell: (row) => (
                <div className="roster-action-group">
                  {snapshot.puedeCorregir && row.corregible && (
                    <button
                      type="button"
                      className="roster-btn"
                      disabled={busy || conflict || !summaryCurrent}
                      onClick={() => setCorrecting(row)}
                      title="Corregir asistencia"
                    >
                      <span>Corregir</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="roster-btn"
                    disabled={busy}
                    onClick={() => showHistory(row)}
                    title="Ver historial de asistencia"
                  >
                    <span>Historial</span>
                  </button>
                </div>
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
      {studentDetail && (
        <Dialog
          title={`Ficha del estudiante · ${studentDetail.estudiante}`}
          onClose={() => showStudentDetail(null)}
        >
          <Facts
            items={[
              [
                "Documento",
                `${studentDetail.tipo_documento} ${studentDetail.numero_documento}`,
              ],
              ["Código de matrícula", studentDetail.codigo_matricula],
              ["Intento académico", String(studentDetail.numero_intento)],
              ["Estado de matrícula", studentDetail.estado_matricula],
              [
                "Asistencia de esta sesión",
                studentDetail.asistencia?.codigo
                  ? `${studentDetail.asistencia.codigo} · ${attendanceCodes[studentDetail.asistencia.codigo]}`
                  : "Pendiente",
              ],
              [
                "Asistencia acumulada",
                studentDetail.resumenAsistencia.inasistenciaPct === null
                  ? "Sin sesiones computables"
                  : `${studentDetail.resumenAsistencia.inasistenciaPct}% de inasistencia`,
              ],
            ]}
          />
          <p className="help">
            La ficha muestra los datos académicos disponibles para este grupo.
          </p>
          <footer className="actions">
            <Button onClick={() => showStudentDetail(null)}>Cerrar</Button>
          </footer>
        </Dialog>
      )}
    </section>
  );
}
