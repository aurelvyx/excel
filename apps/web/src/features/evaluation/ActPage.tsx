import { useState } from "react";
import { api, errorText } from "../../shared/api";
import { academicConditionLabels } from "../../shared/academic-result";
import { navigate } from "../../shared/navigation";
import { useApiQuery } from "../../shared/useApiQuery";
import {
  EnrollmentAttempt,
  StudentIdentity,
} from "../../shared/ui/AcademicCells";
import { Button } from "../../shared/ui/Button";
import { DataTable } from "../../shared/ui/DataTable";
import { Facts } from "../../shared/ui/Facts";
import { Feedback, Loading } from "../../shared/ui/Feedback";
import { ListPanel } from "../../shared/ui/ListPanel";
import { PageHeading } from "../../shared/ui/PageHeading";
import { Pagination } from "../../shared/ui/Pagination";
import { AttendanceSummary } from "../attendance/AttendanceSummary";
import { GroupContext } from "../attendance/GroupContext";
import { academicTime } from "../attendance/model";
import { AcademicResultSummary } from "./AcademicResultSummary";
import { ActActionDialog } from "./ActActionDialog";
import { ActDetailDialog, type ActCorrection } from "./ActDetailDialog";
import { ActHistory, StoredResultFacts } from "./ActHistory";
import { ActTotals } from "./ActTotals";
import { GradeSummary } from "./GradeSummary";
import { displayedGrade } from "./grade-capture";
import type { ActRow, ActView } from "./acts-model";

function Heading({ children }: { children?: React.ReactNode }) {
  return (
    <PageHeading
      eyebrow="Evaluación"
      title="Resultados y acta"
      description="Revisa asistencia, notas y condición de cada intento antes de confirmar el cierre del grupo."
      action={children}
    />
  );
}
export function ActPage({
  groupId,
  query,
}: {
  groupId: string;
  query: URLSearchParams;
}) {
  const after = query.get("after") ?? "";
  const endpoint = `evaluacion/grupos/${groupId}/acta`;
  const search = new URLSearchParams({ limit: "20" });
  if (after) search.set("after", after);
  const queryPath = `${endpoint}?${search}`;
  const { data, loading, error, reload } = useApiQuery<ActView>(queryPath);
  if (!loading && !error && data)
    return (
      <ActReview
        key={after}
        initial={data}
        after={after}
        endpoint={endpoint}
        queryPath={queryPath}
      />
    );
  return (
    <section>
      <a className="back-link" href={`#/evaluacion/grupos/${groupId}`}>
        ← Volver a evaluaciones
      </a>
      <Heading />
      {loading ? (
        <Loading>Cargando resultados y acta…</Loading>
      ) : (
        <Feedback onRetry={reload}>{error}</Feedback>
      )}
    </section>
  );
}
function ActReview({
  initial,
  after,
  endpoint,
  queryPath,
}: {
  initial: ActView;
  after: string;
  endpoint: string;
  queryPath: string;
}) {
  const [data, setData] = useState(initial);
  const [busy, pending] = useState(false);
  const [stale, block] = useState(false);
  const [closing, close] = useState(false);
  const [detail, showDetail] = useState<{
    row: ActRow;
    action?: ActCorrection;
  } | null>(null);
  const [error, fail] = useState("");
  const [success, notify] = useState("");
  async function refresh() {
    pending(true);
    fail("");
    try {
      setData(await api<ActView>(queryPath));
      block(false);
    } catch (error) {
      fail(errorText(error));
      block(true);
    } finally {
      pending(false);
    }
  }
  async function saved(message: string) {
    close(false);
    showDetail(null);
    notify(message);
    block(true);
    await refresh();
  }
  const path = `/evaluacion/grupos/${data.grupo.id}/acta`;
  const original = data.cierre?.resumen.items ?? [];
  const names = Object.fromEntries(
    [...original, ...data.items].map((row) => [
      row.matricula_id,
      `${row.codigo_matricula} · ${row.estudiante}`,
    ]),
  );
  return (
    <section>
      <a className="back-link" href={`#/evaluacion/grupos/${data.grupo.id}`}>
        ← Volver a evaluaciones
      </a>
      <Heading>
        {data.puedeCerrar && (
          <Button
            variant="primary"
            disabled={busy || stale || closing}
            onClick={() => close(true)}
          >
            Cerrar acta
          </Button>
        )}
      </Heading>
      <GroupContext group={data.grupo} />
      <p>
        <a href={`#/evaluacion/grupos/${data.grupo.id}/calificaciones`}>
          Calificaciones
        </a>
        {" · "}
        <a href={`#/evaluacion/grupos/${data.grupo.id}`}>Criterios del grupo</a>
        {" · "}
        <a href={`#/asistencia/grupos/${data.grupo.id}/cierre`}>
          Cierre de asistencia
        </a>
      </p>
      <Feedback tone="success">{success}</Feedback>
      <Feedback>{error}</Feedback>
      {stale && (
        <Feedback tone="notice">
          La revisión no está actualizada. Recarga el acta para consultar los
          resultados vigentes y continuar.
        </Feedback>
      )}
      <section className="panel closure-review" aria-label="Estado del acta">
        <h2>
          {stale
            ? "Acta pendiente de actualización"
            : data.cierre
              ? "Acta cerrada"
              : "Acta abierta"}
        </h2>
        <Facts
          items={[
            [
              "Estado del acta",
              stale
                ? "Pendiente de consulta"
                : data.cierre
                  ? "Cerrada"
                  : "Abierta",
            ],
            [
              "Versión de criterios",
              data.plan
                ? `${data.plan.version} · ${data.plan.nombre}`
                : "Sin criterios aprobados",
            ],
            ...(data.cierre
              ? ([
                  ["Cerrada por", data.cierre.realizado_nombre],
                  ["Fecha del cierre", academicTime(data.cierre.realizado_at)],
                  [
                    "Motivo del cierre",
                    data.cierre.motivo || "Sin motivo adicional",
                  ],
                ] as const)
              : []),
          ]}
        />
        {!data.puedeCerrar && !data.puedeCorregir && (
          <p className="readonly">
            Solo lectura · Consulta los resultados y pendientes del grupo. El
            cierre y las correcciones de acta requieren administración.
          </p>
        )}
        <p className="help">
          La condición aplica primero el límite de asistencia y después la nota
          oficial. Los resultados se confirman al cerrar el acta.
        </p>
        <Button
          busy={busy}
          busyLabel="Actualizando…"
          onClick={() => void refresh()}
        >
          Recargar acta
        </Button>
      </section>
      {!stale && (
        <section
          className="panel closure-review"
          aria-label="Revisión completa del grupo"
        >
          <h2>Revisión completa del grupo</h2>
          <p className="help">
            Los totales incluyen todas las matrículas revisables del grupo,
            también las de otras páginas.
          </p>
          <ActTotals value={data.resumen} />
          {data.pendientes.length > 0 && (
            <>
              <h3>Pendientes antes del cierre</h3>
              <ul>
                {data.pendientes.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </>
          )}
          {!data.cierre && (
            <p className="notice">
              El cierre exige asistencia cerrada, sesiones computables y todas
              las marcas y notas completas. Confirmará los resultados y cerrará
              las matrículas activas del grupo.
            </p>
          )}
        </section>
      )}
      <ListPanel
        loading={false}
        loadingLabel="Cargando resultados…"
        error=""
        onRetry={() => void refresh()}
        empty={data.items.length === 0}
        emptyDescription={
          after
            ? "No hay matrículas en esta página. Vuelve a la primera página."
            : "No hay matrículas revisables en este grupo."
        }
        pagination={
          <Pagination
            count={data.items.length}
            after={after}
            nextCursor={data.nextCursor}
            onChange={(cursor) =>
              navigate(cursor ? `${path}?after=${cursor}` : path)
            }
          />
        }
      >
        <DataTable
          caption="Resultados del grupo"
          rows={data.items}
          rowKey={(row) => row.matricula_id}
          columns={[
            {
              key: "estudiante",
              header: "Estudiante / matrícula",
              cell: (row) => (
                <>
                  <StudentIdentity
                    name={row.estudiante}
                    documentType={row.tipo_documento}
                    documentNumber={row.numero_documento}
                  />
                  <p className="attendance-document">
                    <EnrollmentAttempt
                      code={row.codigo_matricula}
                      attempt={row.numero_intento}
                      state={row.estado_matricula}
                    />
                  </p>
                </>
              ),
            },
            {
              key: "asistencia",
              header: "Asistencia actual",
              className: "attendance-calculation",
              cell: (row) => (
                <AttendanceSummary
                  summary={row.resumenAsistencia}
                  label={`Resumen de asistencia de ${row.estudiante}`}
                  compact
                  stale={stale}
                />
              ),
            },
            {
              key: "notas",
              header: "Notas actuales",
              className: "attendance-calculation",
              cell: (row) => (
                <GradeSummary
                  summary={row.resumenNotas}
                  label={`Resumen de notas de ${row.estudiante}`}
                  stale={stale}
                  compact
                  staleMessage="Recarga el acta para consultar las notas y su cálculo vigente."
                />
              ),
            },
            {
              key: "condicion",
              header: "Condición actual",
              className: "attendance-calculation",
              cell: (row) => (
                <>
                  <AcademicResultSummary
                    label={`Condición de ${row.estudiante}`}
                    condition={row.calculo.condicion}
                    pending={row.calculo.pendientes}
                    confirmed={
                      !!data.cierre &&
                      row.resultado?.cierre_id === data.cierre.id &&
                      !!row.resultado.confirmado_at
                    }
                    stale={stale}
                  />
                  {!stale && (
                    <details className="act-stored-result">
                      <summary>Consultar resultado guardado</summary>
                      <StoredResultFacts result={row.resultado} compact />
                    </details>
                  )}
                </>
              ),
            },
            {
              key: "acciones",
              header: "Acciones",
              className: "row-actions",
              cell: (row) => (
                <>
                  <Button
                    variant="link"
                    disabled={busy || stale}
                    aria-label={`Detalle e historial de ${row.estudiante}`}
                    onClick={() => showDetail({ row })}
                  >
                    Ver detalle e historial
                  </Button>
                  {data.puedeCorregir &&
                    row.resultado?.cierre_id === data.cierre?.id && (
                      <>
                        <Button
                          variant="link"
                          disabled={busy || stale}
                          aria-label={`Corregir nota de ${row.estudiante}`}
                          onClick={() => showDetail({ row, action: "grade" })}
                        >
                          Corregir nota
                        </Button>
                        <Button
                          variant="link"
                          disabled={busy || stale}
                          aria-label={`Corregir asistencia de ${row.estudiante}`}
                          onClick={() =>
                            showDetail({ row, action: "attendance" })
                          }
                        >
                          Corregir asistencia
                        </Button>
                      </>
                    )}
                </>
              ),
            },
          ]}
        />
      </ListPanel>
      {data.cierre && (
        <section
          className="panel closure-review"
          aria-label="Evidencia original del cierre"
        >
          <h2>Evidencia original del cierre</h2>
          <p>
            Esta revisión se conserva tal como fue confirmada. Las correcciones
            posteriores figuran en el historial.
          </p>
          <details>
            <summary>Consultar revisión original del cierre</summary>
            {data.cierre.resumen.resumen && (
              <ActTotals value={data.cierre.resumen.resumen} />
            )}
            <DataTable
              caption="Resultados de la revisión original"
              rows={original}
              rowKey={(row) => row.matricula_id}
              emptyMessage="Este cierre histórico no contiene una revisión detallada."
              columns={[
                {
                  key: "estudiante",
                  header: "Estudiante / matrícula",
                  cell: (row) => (
                    <>
                      {row.estudiante}
                      <small className="attendance-document">
                        {row.codigo_matricula} · Intento {row.numero_intento}
                      </small>
                    </>
                  ),
                },
                {
                  key: "condicion",
                  header: "Condición original",
                  cell: (row) =>
                    academicConditionLabels[row.calculo.condicion ?? ""] ??
                    "Pendiente",
                },
                {
                  key: "nota",
                  header: "Nota oficial original",
                  cell: (row) => row.resumenNotas.notaOficial ?? "Pendiente",
                },
                {
                  key: "promedio",
                  header: "Promedio original",
                  cell: (row) => displayedGrade(row.resumenNotas.promedio),
                },
                {
                  key: "asistencia",
                  header: "Inasistencia original",
                  cell: (row) =>
                    row.resumenAsistencia.inasistenciaPct === null
                      ? "Pendiente"
                      : `${row.resumenAsistencia.inasistenciaPct.replace(".", ",")} %`,
                },
              ]}
            />
          </details>
        </section>
      )}
      {!stale && (
        <section
          className="panel closure-review"
          aria-label="Historial del acta"
        >
          <h2>Historial del acta</h2>
          <ActHistory items={data.historial} labels={names} />
        </section>
      )}
      {closing && (
        <ActActionDialog
          title="Cerrar acta"
          context={
            <>
              <p>
                Grupo {data.grupo.codigo} · {data.grupo.contexto.periodo} ·{" "}
                {data.grupo.contexto.idioma} · {data.grupo.contexto.nivel}
              </p>
              <ActTotals value={data.resumen} />
            </>
          }
          reviewContent={
            <p>
              Se confirmarán los resultados de las {data.resumen.matriculas}{" "}
              matrículas revisables del grupo completo.
            </p>
          }
          consequence="Al confirmar se cerrará el acta, se guardarán los resultados oficiales y las matrículas activas pasarán a cerradas. El docente no podrá editar notas. Las correcciones posteriores requieren administración, motivo y recálculo auditado. Esta acción no cierra el grupo ni el periodo y no permite reabrir el acta."
          onClose={() => close(false)}
          onConflict={() => block(true)}
          onReload={() => {
            close(false);
            void refresh();
          }}
          onConfirm={async (reason) => {
            await api(endpoint, {
              method: "POST",
              body: { revision: data.revision, motivo: reason },
            });
            await saved("Acta cerrada y resultados confirmados.");
          }}
        />
      )}
      {detail && (
        <ActDetailDialog
          row={detail.row}
          initialAction={detail.action}
          endpoint={endpoint}
          onClose={() => showDetail(null)}
          onSaved={(changed) =>
            saved(
              changed
                ? "Corrección registrada y resultado recalculado."
                : "No hay cambios: el registro conserva sus valores y su versión.",
            )
          }
          onConflict={() => block(true)}
          onReload={() => {
            showDetail(null);
            void refresh();
          }}
        />
      )}
    </section>
  );
}
