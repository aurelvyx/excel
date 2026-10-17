import { useRef, useState } from "react";
import { ApiError, api, errorText } from "../../shared/api";
import { navigate } from "../../shared/navigation";
import { useApiQuery } from "../../shared/useApiQuery";
import { useUnsavedChanges } from "../../shared/useUnsavedChanges";
import {
  EnrollmentAttempt,
  StudentIdentity,
} from "../../shared/ui/AcademicCells";
import { Button } from "../../shared/ui/Button";
import { CaptureToolbar } from "../../shared/ui/CaptureToolbar";
import { DataTable, type Column } from "../../shared/ui/DataTable";
import { Facts } from "../../shared/ui/Facts";
import { Feedback, Loading } from "../../shared/ui/Feedback";
import { InputField, SelectField } from "../../shared/ui/Field";
import { ListPanel } from "../../shared/ui/ListPanel";
import { PageHeading } from "../../shared/ui/PageHeading";
import { Pagination } from "../../shared/ui/Pagination";
import { StatusBadge } from "../../shared/ui/StatusBadge";
import { GroupContext } from "../attendance/GroupContext";
import { academicTime } from "../attendance/model";
import { GradeHistoryDialog } from "./GradeHistoryDialog";
import { GradeSummary } from "./GradeSummary";
import { ReportLink } from "../reports/ReportLink";
import {
  captureGradeError,
  displayedGrade,
  gradeCaptureValue,
} from "./grade-capture";
import type {
  Grade,
  GradeRow,
  GradesPageData,
  SavedGrades,
} from "./grades-model";

function GradesHeading() {
  return (
    <PageHeading
      eyebrow="Evaluación"
      title="Registro de calificaciones"
      description="Registra notas de 0 a 20 y consulta el promedio de cada intento según sus criterios aprobados."
    />
  );
}
export function GradesPage({
  groupId,
  query,
}: {
  groupId: string;
  query: URLSearchParams;
}) {
  const after = query.get("after") ?? "";
  const path = `/evaluacion/grupos/${groupId}/calificaciones`;
  const endpoint = `evaluacion/grupos/${groupId}/calificaciones`;
  const search = new URLSearchParams({ limit: "20" });
  if (after) search.set("after", after);
  const queryPath = `${endpoint}?${search}`;
  const { data, loading, error, reload } =
    useApiQuery<GradesPageData>(queryPath);
  if (!loading && !error && data)
    return (
      <GradesMatrix
        key={after}
        initial={data}
        endpoint={endpoint}
        path={path}
        after={after}
        queryPath={queryPath}
        reload={reload}
      />
    );
  return (
    <section>
      <a className="back-link" href={`#/evaluacion/grupos/${groupId}`}>
        ← Volver a evaluaciones
      </a>
      <GradesHeading />
      {loading ? (
        <Loading>Cargando calificaciones…</Loading>
      ) : (
        <Feedback onRetry={reload}>{error}</Feedback>
      )}
    </section>
  );
}

function GradesMatrix({
  initial,
  endpoint,
  path,
  after,
  queryPath,
  reload,
}: {
  initial: GradesPageData;
  endpoint: string;
  path: string;
  after: string;
  queryPath: string;
  reload: () => void;
}) {
  const [snapshot, setSnapshot] = useState(initial);
  const [evaluationId, selectEvaluation] = useState(
    initial.evaluaciones[0]?.id ?? "",
  );
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [error, fail] = useState("");
  const [success, notify] = useState("");
  const [summaryError, failSummary] = useState("");
  const [summaryCurrent, setSummaryCurrent] = useState(true);
  const [conflict, block] = useState(false);
  const [busy, pending] = useState(false);
  const [history, showHistory] = useState<{
    row: GradeRow;
    indicatorId: string;
    code: string;
  } | null>(null);
  const saving = useRef(false);
  const changes = Object.keys(drafts).length;
  const dirty = changes > 0;
  const guard = useUnsavedChanges(dirty, busy);
  const evaluation = snapshot.evaluaciones.find(
    (item) => item.id === evaluationId,
  );
  const key = (rowId: string, indicatorId: string) => `${rowId}:${indicatorId}`;
  const recorded = (row: GradeRow, indicatorId: string) =>
    row.calificaciones.find((item) => item.indicador_id === indicatorId);
  function change(row: GradeRow, indicatorId: string, value: string) {
    const field = key(row.matricula_id, indicatorId);
    notify("");
    setIssues((old) => ({ ...old, [field]: "" }));
    setDrafts((old) => {
      const next = { ...old };
      if (value === (recorded(row, indicatorId)?.nota.replace(".", ",") ?? ""))
        delete next[field];
      else next[field] = value;
      return next;
    });
  }
  async function applySaved(response: SavedGrades) {
    const saved = new Map(
      response.items.map((item) => [
        key(item.matricula_id, item.indicador_id),
        item,
      ]),
    );
    const summaries = new Map(
      response.resumenes.map((item) => [item.matriculaId, item.resumenNotas]),
    );
    setSnapshot((old) => ({
      ...old,
      preparacionActa: response.preparacionActa,
      items: old.items.map((row) => {
        const grades = new Map(
          row.calificaciones.map((item) => [item.indicador_id, item]),
        );
        for (const grade of saved.values())
          if (grade.matricula_id === row.matricula_id)
            grades.set(grade.indicador_id, grade);
        return {
          ...row,
          calificaciones: [...grades.values()],
          resumenNotas: summaries.get(row.matricula_id) ?? row.resumenNotas,
        };
      }),
    }));
    setDrafts({});
    notify("Calificaciones guardadas.");
    setSummaryCurrent(false);
    failSummary("");
    try {
      setSnapshot(await api<GradesPageData>(queryPath));
      setSummaryCurrent(true);
    } catch {
      failSummary(
        "Las notas se guardaron, pero no se pudo actualizar el cálculo. Recarga las calificaciones para consultar los valores vigentes.",
      );
    }
  }
  async function save() {
    if (saving.current || !dirty || !snapshot.puedeEditar || conflict) return;
    const next: Record<string, string> = {};
    for (const [field, value] of Object.entries(drafts)) {
      const issue = captureGradeError(value);
      if (issue) next[field] = issue;
    }
    setIssues(next);
    if (Object.keys(next).length) {
      const [field] = Object.keys(next);
      const indicatorId = field.split(":")[1];
      const owner = snapshot.evaluaciones.find((item) =>
        item.indicadores.some((indicator) => indicator.id === indicatorId),
      );
      if (owner) selectEvaluation(owner.id);
      setTimeout(
        () =>
          document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
        0,
      );
      return;
    }
    const registros = Object.entries(drafts).map(([field, value]) => {
      const [matriculaId, indicadorId] = field.split(":");
      const row = snapshot.items.find(
        (item) => item.matricula_id === matriculaId,
      )!;
      return {
        matriculaId,
        indicadorId,
        nota: gradeCaptureValue(value),
        version: recorded(row, indicadorId)?.version ?? null,
      };
    });
    saving.current = true;
    pending(true);
    fail("");
    notify("");
    try {
      await applySaved(
        await api<SavedGrades>(endpoint, {
          method: "PATCH",
          body: { registros },
        }),
      );
    } catch (e) {
      fail(errorText(e));
      if (e instanceof ApiError && (e.status === 409 || e.status === 403)) {
        block(true);
        setSummaryCurrent(false);
      }
    } finally {
      saving.current = false;
      pending(false);
    }
  }
  function gradeCell(
    row: GradeRow,
    indicator: NonNullable<typeof evaluation>["indicadores"][number],
  ) {
    const field = key(row.matricula_id, indicator.id);
    const grade: Grade | undefined = recorded(row, indicator.id);
    const editable = snapshot.puedeEditar && row.editable;
    return (
      <>
        {editable ? (
          <InputField
            id={`grade-${row.matricula_id}-${indicator.id}`}
            label={`Nota ${indicator.codigo} de ${row.estudiante}`}
            inputMode="decimal"
            autoComplete="off"
            value={drafts[field] ?? grade?.nota.replace(".", ",") ?? ""}
            placeholder="Pendiente"
            error={issues[field]}
            hint="0 a 20 · hasta dos decimales"
            disabled={busy || conflict}
            onChange={(event) => change(row, indicator.id, event.target.value)}
          />
        ) : (
          <StatusBadge inactive={!grade}>
            {displayedGrade(grade?.nota ?? null)}
          </StatusBadge>
        )}
        <small className="attendance-document">
          {drafts[field] !== undefined
            ? "Sin guardar"
            : grade
              ? "Registrada"
              : "Pendiente"}
        </small>
        {grade && (
          <Button
            variant="link"
            disabled={busy}
            aria-label={`Historial de ${indicator.codigo} de ${row.estudiante}`}
            onClick={() =>
              showHistory({
                row,
                indicatorId: indicator.id,
                code: indicator.codigo,
              })
            }
          >
            Historial
          </Button>
        )}
      </>
    );
  }
  const columns: Column<GradeRow>[] = [
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
    ...(evaluation?.indicadores.map((indicator) => ({
      key: indicator.id,
      header: (
        <>
          <span>
            {indicator.codigo} · {indicator.peso_pct} %
          </span>
          <small className="grade-indicator-description">
            {indicator.descripcion}
          </small>
        </>
      ),
      className: "grade-cell",
      cell: (row: GradeRow) => gradeCell(row, indicator),
    })) ?? []),
    {
      key: "resumen",
      header: "Calificación del nivel",
      className: "attendance-calculation",
      cell: (row) => (
        <GradeSummary
          summary={row.resumenNotas}
          label={`Resumen de notas de ${row.estudiante}`}
          stale={!summaryCurrent}
        />
      ),
    },
  ];
  return (
    <section>
      <a
        className="back-link"
        href={`#/evaluacion/grupos/${snapshot.grupo.id}`}
      >
        ← Volver a evaluaciones
      </a>
      <GradesHeading />
      <GroupContext group={snapshot.grupo} />
      <p>
        <a href={`#/asistencia/grupos/${snapshot.grupo.id}`}>
          Sesiones y asistencia
        </a>
        {" · "}
        <a href={`#/evaluacion/grupos/${snapshot.grupo.id}`}>
          Criterios del grupo
        </a>
        {" · "}
        <a href={`#/evaluacion/grupos/${snapshot.grupo.id}/acta`}>
          Resultados y acta
        </a>
        {" · "}
        <ReportLink groupId={snapshot.grupo.id} />
      </p>
      <section
        className="panel panel-content"
        aria-label="Contexto de calificaciones"
      >
        <Facts
          items={[
            ["Estado del acta", snapshot.acta.cerrada ? "Cerrada" : "Abierta"],
            [
              "Versión de criterios",
              snapshot.plan
                ? `${snapshot.plan.version} · ${snapshot.plan.nombre}`
                : "Sin criterios aprobados",
            ],
            ...(snapshot.acta.cierre
              ? ([
                  ["Cerrada por", snapshot.acta.cierre.realizado_nombre ?? "—"],
                  [
                    "Fecha del cierre",
                    snapshot.acta.cierre.realizado_at
                      ? academicTime(snapshot.acta.cierre.realizado_at)
                      : "—",
                  ],
                ] as const)
              : []),
          ]}
        />
        {!snapshot.configuracion && (
          <p className="notice">
            Aplica una versión aprobada de criterios antes de registrar
            calificaciones.
          </p>
        )}
        {snapshot.evaluaciones.length > 0 && (
          <SelectField
            label="Evaluación"
            value={evaluationId}
            disabled={busy || conflict}
            onChange={(event) => selectEvaluation(event.target.value)}
            hint="El cambio de evaluación conserva las notas capturadas de esta página."
          >
            {snapshot.evaluaciones.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nombre} · {item.peso_pct} %
              </option>
            ))}
          </SelectField>
        )}
        {evaluation?.unidad_id && (
          <p className="help">
            Unidad:{" "}
            {snapshot.unidades.find((item) => item.id === evaluation.unidad_id)
              ?.nombre ?? "Unidad del criterio aprobado"}
          </p>
        )}
      </section>
      {!snapshot.puedeEditar && (
        <p className="readonly">
          Solo lectura ·{" "}
          {snapshot.motivoSoloLectura ??
            "Tu cuenta puede consultar las calificaciones del grupo."}
        </p>
      )}
      <Feedback tone="success">{success}</Feedback>
      <Feedback tone="notice">{summaryError}</Feedback>
      <Feedback>{error}</Feedback>
      {conflict && (
        <p className="notice">
          La captura se conserva. Recarga las calificaciones para revisar los
          registros y permisos vigentes antes de continuar.
        </p>
      )}
      <p className="help">
        Los promedios y notas oficiales calculadas corresponden a las notas
        guardadas y a todos los criterios del nivel. La captura sin guardar no
        los modifica. La condición académica y el cierre del acta requieren su
        revisión posterior.
      </p>
      <ListPanel
        loading={false}
        loadingLabel="Cargando calificaciones…"
        error=""
        onRetry={reload}
        empty={!snapshot.items.length}
        emptyDescription={
          after
            ? "No hay matrículas en esta página. Vuelve a la primera página."
            : "No hay matrículas disponibles para calificar en este grupo."
        }
        filters={
          <CaptureToolbar
            changes={changes}
            unit={["nota", "notas"]}
            busy={busy}
            reloadLabel="Recargar calificaciones"
            onReload={() => guard.request(reload)}
          />
        }
        pagination={
          <Pagination
            count={snapshot.items.length}
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
          caption="Calificaciones del grupo"
          rows={snapshot.items}
          rowKey={(row) => row.matricula_id}
          columns={columns}
        />
      </ListPanel>
      {summaryCurrent && (
        <section
          className="panel panel-content"
          aria-label="Pendientes de calificación"
        >
          <Facts
            items={[
              [
                "Calificaciones registradas",
                snapshot.preparacionActa.calificacionesRegistradas,
              ],
              [
                "Calificaciones pendientes",
                snapshot.preparacionActa.calificacionesPendientes,
              ],
            ]}
          />
        </section>
      )}
      {snapshot.puedeEditar && (
        <footer className="actions">
          <Button
            variant="primary"
            disabled={!dirty || conflict}
            busy={busy}
            busyLabel="Guardando calificaciones…"
            onClick={() => void save()}
          >
            Guardar calificaciones
          </Button>
        </footer>
      )}
      {guard.confirmation}
      {history && (
        <GradeHistoryDialog
          name={history.row.estudiante}
          indicator={history.code}
          endpoint={`${endpoint}/${history.row.matricula_id}/indicadores/${history.indicatorId}/historial`}
          onClose={() => showHistory(null)}
        />
      )}
    </section>
  );
}
