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
import { GroupContext } from "./GroupContext";
import { AttendanceSummary } from "./AttendanceSummary";
import {
  attendanceCodes,
  sessionDate,
  sessionStates,
  sessionTime,
  type AttendanceCode,
  type AttendancePageData,
  type AttendanceRecord,
  type AttendanceRow,
  type AttendanceSummaryData,
  type ClassSession,
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
      if (canEdit && row.editable) change(row, { codigo: "P" });
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
      const response = await api<{
        items: AttendanceRecord[];
        sesion: ClassSession;
        resumenes: {
          matriculaId: string;
          resumenAsistencia: AttendanceSummaryData;
        }[];
      }>(endpoint, {
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
      notify("Asistencia guardada.");
      setSummaryCurrent(false);
      failSummary("");
      // Una clase recién realizada cambia el denominador de todas las matrículas,
      // incluso de las filas que no se enviaron en este guardado.
      try {
        const current = await api<AttendancePageData>(queryPath);
        setSnapshot(current);
        setSummaryCurrent(true);
      } catch {
        failSummary(
          "La asistencia se guardó, pero no se pudo actualizar el resumen. Recarga la asistencia para consultar los cálculos vigentes.",
        );
      }
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
        realizadas del grupo hasta hoy en Lima. Las programadas y canceladas no
        computan. Los cambios sin guardar no modifican este resumen.
      </p>
      <ListPanel
        loading={false}
        loadingLabel="Cargando asistencia…"
        error=""
        onRetry={reload}
        empty={!rows.length}
        emptyDescription="No hay matrículas disponibles para esta sesión en esta página."
        filters={
          <div className="selection-toolbar attendance-toolbar">
            <div>
              {canEdit && (
                <Button
                  disabled={
                    busy || conflict || !rows.some((row) => row.editable)
                  }
                  onClick={markPresent}
                >
                  Marcar presentes
                </Button>
              )}
              <Button disabled={busy} onClick={() => guard.request(reload)}>
                Recargar asistencia
              </Button>
            </div>
            <span role="status">
              {dirty
                ? `${changedRows} ${changedRows === 1 ? "fila" : "filas"} con cambios sin guardar`
                : "Sin cambios pendientes"}
            </span>
          </div>
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
                <>
                  {row.estudiante}
                  <small className="attendance-document">
                    {row.tipo_documento} {row.numero_documento}
                  </small>
                </>
              ),
            },
            {
              key: "matricula",
              header: "Matrícula / intento",
              cell: (row) => (
                <>
                  {row.codigo_matricula}
                  <small className="attendance-document">
                    Intento {row.numero_intento} ·{" "}
                    {row.estado_matricula === "ACTIVA"
                      ? "Activa"
                      : row.estado_matricula}
                  </small>
                </>
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
                    disabled={busy || conflict}
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
              cell: (row) =>
                drafts[row.matricula_id]
                  ? "Sin guardar"
                  : row.asistencia
                    ? "Registrado"
                    : "Pendiente",
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
    </section>
  );
}
