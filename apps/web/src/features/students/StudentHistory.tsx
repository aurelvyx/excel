import { SelectField } from "../../shared/ui/Field";
import { Feedback, Loading } from "../../shared/ui/Feedback";
import { Pagination } from "../../shared/ui/Pagination";
import { DataTable } from "../../shared/ui/DataTable";
import { StatusBadge } from "../../components/shared";
import { useApiQuery } from "../../shared/useApiQuery";
import { Button } from "../../shared/ui/Button";
import { useEffect, useState } from "react";
import { api, errorText, text, type Page, type Row } from "../../shared/api";
import { academicConditionLabels } from "../../shared/academic-result";
import { AttendanceSummary } from "../attendance/AttendanceSummary";
import type { AttendanceSummaryData } from "../attendance/model";
import { GradeSummary } from "../evaluation/GradeSummary";
import type { GradeSummaryData } from "../evaluation/grades-model";
import {
  justificationStates,
  type JustificationState,
} from "../attendance/justification-model";
import { AttendanceWeekGrid } from "./AttendanceWeekGrid";
import type { SessionMark } from "./attendance-grid";

type HistoryRow = Row & {
  resumenAsistencia?: AttendanceSummaryData;
  resumenNotas?: GradeSummaryData;
};
type HistoryPage = Omit<Page, "items"> & {
  items: HistoryRow[];
  opciones: Row[];
};

const enrollmentStates: Record<string, string> = {
  PENDIENTE: "Pendiente de voucher",
  ACTIVA: "Activa",
  ANULADA: "Anulada",
  CERRADA: "Cerrada",
};

function ResultBadge({ row }: { row: Row }) {
  const result = row.resultado as Record<string, unknown> | null;
  if (!result) return <StatusBadge inactive>Sin resultado</StatusBadge>;
  const condition = text(result, "condicion");
  return (
    <StatusBadge inactive={condition !== "APROBADO"}>
      {academicConditionLabels[condition] ?? "Pendiente"}
      {result.confirmadoAt ? "" : " (provisional)"}
    </StatusBadge>
  );
}

function Result({ row }: { row: Row }) {
  const result = row.resultado as Record<string, unknown> | null;
  if (!result) return <p>Resultado pendiente de cálculo.</p>;
  const attendanceLabel = `Asistencia del resultado ${result.confirmadoAt ? "confirmado" : "provisional"}`;
  return (
    <div className="notice">
      <p>
        {result.confirmadoAt ? "Resultado confirmado" : "Resultado provisional"}
        : {academicConditionLabels[text(result, "condicion")] ?? "Pendiente"}
      </p>
      <p>
        Promedio: {text(result, "promedio") || "Pendiente"} · Nota oficial:{" "}
        {text(result, "notaOficial") || "Pendiente"}
      </p>
      <section aria-label={attendanceLabel}>
        <p>
          <strong>{attendanceLabel}</strong>
        </p>
        <p>
          Inasistencia:{" "}
          {result.inasistenciaPct == null
            ? "Pendiente"
            : `${text(result, "inasistenciaPct").replace(".", ",")} %`}
        </p>
        <p>
          Tardanzas: {text(result, "tardanzas") || "Pendiente"} · Faltas
          equivalentes: {text(result, "faltasEquivalentes") || "Pendiente"}
        </p>
      </section>
    </div>
  );
}

/** Cifras clave de la tarjeta; el cálculo oficial viene de la API. */
function KeyFigures({ row }: { row: HistoryRow }) {
  const attendance = row.resumenAsistencia;
  const grades = row.resumenNotas;
  const absence =
    !attendance || attendance.estado === "NO_APLICA"
      ? "—"
      : attendance.inasistenciaPct === null
        ? "Pendiente"
        : `${attendance.inasistenciaPct.replace(".", ",")} %`;
  const average = grades?.promedio ?? null;
  const attendanceBreakdown =
    attendance && attendance.sesionesComputables > 0
      ? `Sesiones: ${attendance.sesionesComputables} · P:${attendance.presentes} · T:${attendance.tardanzas} · F:${attendance.faltas} · J:${attendance.justificadas}`
      : "Límite máx. permitido: 30 %";
  return (
    <dl className="enrollment-figures">
      <div>
        <dt>Inasistencia acumulada</dt>
        <dd>
          {absence}
          <span className="enrollment-figure-hint">{attendanceBreakdown}</span>
        </dd>
      </div>
      <div>
        <dt>Promedio ponderado</dt>
        <dd>
          {average ? average : "Pendiente"}
          <span className="enrollment-figure-hint">
            {grades?.notaOficial != null
              ? `Nota oficial: ${grades.notaOficial} (mín. 13)`
              : "Mínimo aprobatorio: 13"}
          </span>
        </dd>
      </div>
      <div>
        <dt>Notas registradas</dt>
        <dd>
          {grades
            ? `${grades.calificacionesRegistradas} de ${grades.calificacionesEsperadas}`
            : "—"}
          <span className="enrollment-figure-hint">Indicadores calificados</span>
        </dd>
      </div>
      <div>
        <dt>Resultado / Condición</dt>
        <dd>
          <ResultBadge row={row} />
          <span className="enrollment-figure-hint">Dictamen del nivel</span>
        </dd>
      </div>
    </dl>
  );
}

function EnrollmentDetail({ detail }: { detail: HistoryRow }) {
  const marks: SessionMark[] = (detail.asistencias as Row[]).map((row) => ({
    fecha: text(row, "fecha").slice(0, 10),
    codigo: text(row, "codigo") || null,
    estado: text(row, "estado") || "REALIZADA",
  }));
  const justified = (detail.asistencias as Row[]).filter(
    (row) => row.justificacionEstado || row.codigo === "J",
  );
  return (
    <div className="enrollment-detail">
      <section>
        <h4>Resumen</h4>
        <Result row={detail} />
        <AttendanceSummary
          summary={detail.resumenAsistencia}
          label="Resumen de asistencia guardada"
        />
        {detail.resumenNotas && (
          <GradeSummary
            summary={detail.resumenNotas}
            label="Notas guardadas del intento"
            stale={false}
          />
        )}
      </section>
      <section>
        <h4>Asistencia</h4>
        <AttendanceWeekGrid marks={marks} />
        {justified.length > 0 && (
          <DataTable
            caption="Justificaciones del intento"
            rows={justified}
            rowKey={(row) => row.id}
            columns={[
              {
                key: "fecha",
                header: "Fecha",
                cell: (row) => text(row, "fecha"),
              },
              {
                key: "justificacion",
                header: "Estado de la justificación",
                cell: (row) =>
                  row.justificacionEstado
                    ? justificationStates[
                        row.justificacionEstado as JustificationState
                      ]
                    : "Sin solicitud",
              },
            ]}
          />
        )}
      </section>
      <section>
        <h4>Notas y Promedios por Unidad / Evaluación</h4>
        {(() => {
          const notesList = (detail.notas as Row[]) ?? [];
          const byUnit = new Map<string, { notas: number[]; total: number }>();
          for (const n of notesList) {
            const unitName = text(n, "evaluacion") || "Evaluación";
            const current = byUnit.get(unitName) ?? { notas: [], total: 0 };
            current.total += 1;
            if (n.nota != null && String(n.nota).trim() !== "") {
              const num = Number(n.nota);
              if (!Number.isNaN(num)) current.notas.push(num);
            }
            byUnit.set(unitName, current);
          }
          const unitRows = Array.from(byUnit.entries()).map(([unidad, info]) => {
            const avg =
              info.notas.length > 0
                ? Math.round(
                    (info.notas.reduce((a, b) => a + b, 0) / info.notas.length) *
                      100,
                  ) / 100
                : null;
            return {
              id: unidad,
              unidad,
              registradas: `${info.notas.length} de ${info.total}`,
              promedio: avg !== null ? avg.toFixed(2) : "Pendiente",
              condicion:
                avg === null
                  ? "En curso"
                  : avg >= 13
                    ? "Aprobado"
                    : "Desaprobado",
            };
          });
          if (unitRows.length === 0) return null;
          return (
            <div style={{ marginBottom: "1rem" }}>
              <DataTable
                caption="Promedios por evaluación / unidad"
                rows={unitRows}
                rowKey={(row) => row.id}
                columns={[
                  {
                    key: "unidad",
                    header: "Unidad / Evaluación",
                    cell: (row) => row.unidad,
                  },
                  {
                    key: "registradas",
                    header: "Indicadores",
                    cell: (row) => row.registradas,
                  },
                  {
                    key: "promedio",
                    header: "Promedio",
                    cell: (row) => row.promedio,
                  },
                  {
                    key: "condicion",
                    header: "Condición",
                    cell: (row) => (
                      <StatusBadge inactive={row.condicion !== "Aprobado"}>
                        {row.condicion}
                      </StatusBadge>
                    ),
                  },
                ]}
              />
            </div>
          );
        })()}
        <DataTable
          caption="Notas registradas"
          rows={detail.notas as Row[]}
          rowKey={(row) => row.id}
          emptyMessage="Sin evaluaciones registradas."
          columns={[
            {
              key: "evaluacion",
              header: "Evaluación",
              cell: (row) => text(row, "evaluacion"),
            },
            {
              key: "indicador",
              header: "Indicador",
              cell: (row) =>
                `${text(row, "descripcion")}${!row.activo ? " (inactivo)" : ""}`,
            },
            {
              key: "nota",
              header: "Nota",
              cell: (row) =>
                row.nota == null ? "Pendiente" : text(row, "nota"),
            },
          ]}
        />
      </section>
    </div>
  );
}

export function StudentHistory({
  id,
  canResume = false,
  autoExpandFirst = false,
}: {
  id: string;
  canResume?: boolean;
  autoExpandFirst?: boolean;
}) {
  const [nivel, setNivel] = useState("");
  const [periodo, setPeriodo] = useState("");
  const [after, setAfter] = useState("");
  const [actionError, fail] = useState("");
  const [details, setDetails] = useState<Record<string, HistoryRow>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [autoExpandedForId, setAutoExpandedForId] = useState<string>("");
  const query = new URLSearchParams({ limit: "20" });
  if (nivel) query.set("nivelId", nivel);
  if (periodo) query.set("periodoId", periodo);
  if (after) query.set("after", after);
  const {
    data: loaded,
    error: queryError,
    loading,
    reload,
  } = useApiQuery<HistoryPage>(`estudiantes/${id}/historial?${query}`);
  const data = loaded ?? { items: [], nextCursor: null, opciones: [] };
  const error = queryError || actionError;

  const firstAttemptId = data.items[0] ? String(data.items[0].id) : "";
  useEffect(() => {
    if (
      !autoExpandFirst ||
      !firstAttemptId ||
      autoExpandedForId === `${id}:${firstAttemptId}`
    ) {
      return;
    }
    let active = true;
    api<HistoryRow>(`estudiantes/${id}/historial/${firstAttemptId}`)
      .then((detail) => {
        if (!active) return;
        setDetails((old) => ({ ...old, [firstAttemptId]: detail }));
        setOpenId(firstAttemptId);
        setAutoExpandedForId(`${id}:${firstAttemptId}`);
      })
      .catch(() => {
        // User can retry manually via Consultar intento button
      });
    return () => {
      active = false;
    };
  }, [autoExpandFirst, firstAttemptId, id, autoExpandedForId]);
  async function toggle(row: Row) {
    const key = String(row.id);
    if (openId === key) return setOpenId(null);
    fail("");
    if (!details[key]) {
      setLoadingId(key);
      try {
        const detail = await api<HistoryRow>(
          `estudiantes/${id}/historial/${row.id}`,
        );
        setDetails((old) => ({ ...old, [key]: detail }));
      } catch (e) {
        fail(errorText(e));
        return;
      } finally {
        setLoadingId(null);
      }
    }
    setOpenId(key);
  }
  const options = (column: string) => [
    ...new Map(
      data.opciones.map((row) => [text(row, `${column}_id`), row]),
    ).values(),
  ];
  return (
    <section className="panel student-history">
      <div className="student-history-header">
        <div>
          <h2>Historial académico</h2>
          <p className="muted">
            Una tarjeta por matrícula, agrupada por periodo. Cada matrícula cubre el
            nivel completo; las marcas y notas pertenecen solo al intento indicado.
          </p>
        </div>
        {!loading && (
          <span className="student-code-pill">
            {data.items.length} intento(s) en vista
          </span>
        )}
      </div>
      <div className="filters">
        <SelectField
          label="Nivel"
          id="history-level"
          value={nivel}
          onChange={(e) => {
            setNivel(e.target.value);
            setAfter("");
          }}
        >
          <option value="">Todos los niveles</option>
          {options("nivel").map((row) => (
            <option key={text(row, "nivel_id")} value={text(row, "nivel_id")}>
              {text(row, "idioma")} · {text(row, "nivel")}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Periodo"
          id="history-period"
          value={periodo}
          onChange={(e) => {
            setPeriodo(e.target.value);
            setAfter("");
          }}
        >
          <option value="">Todos los periodos</option>
          {options("periodo").map((row) => (
            <option
              key={text(row, "periodo_id")}
              value={text(row, "periodo_id")}
            >
              {text(row, "periodo")}
            </option>
          ))}
        </SelectField>
      </div>
      {error && (
        <Feedback
          onRetry={() => {
            fail("");
            reload();
          }}
          retryLabel="Reintentar historial"
        >
          {error}
        </Feedback>
      )}
      {loading ? (
        <Loading>Cargando historial…</Loading>
      ) : (
        !error && (
          <>
            {!data.items.length ? (
              <p className="muted" style={{ padding: "24px 22px" }}>
                No hay intentos registrados para esta consulta.
              </p>
            ) : (
              <ol className="enrollment-list" aria-label="Intentos académicos">
                {data.items.map((row) => {
                  const key = String(row.id);
                  const expanded = openId === key;
                  const pending = row.estado === "PENDIENTE";
                  const closed = row.estado === "CERRADA" || row.estado === "ANULADA";
                  const attempt = text(row, "numero_intento");
                  return (
                    <li
                      key={key}
                      className={`enrollment-card ${pending ? "is-pending" : closed ? "is-closed" : ""}`}
                    >
                      <header>
                        <div>
                          <p className="eyebrow">
                            {text(row, "periodo")} · Intento {attempt}
                          </p>
                          <h3>
                            {text(row, "idioma")} · {text(row, "nivel")}
                          </h3>
                          <div className="enrollment-meta-row">
                            <span className="enrollment-meta-chip">
                              Grupo <strong>{text(row, "grupo")}</strong>
                            </span>
                            <span className="enrollment-meta-chip">
                              Turno <strong>{text(row, "turno")}</strong>
                            </span>
                            <span className="enrollment-meta-chip">
                              Sección <strong>{text(row, "seccion")}</strong>
                            </span>
                            <span className="enrollment-meta-chip mono">
                              Matrícula <strong>{text(row, "codigo")}</strong>
                            </span>
                          </div>
                        </div>
                        <StatusBadge inactive={row.estado !== "ACTIVA"}>
                          {enrollmentStates[String(row.estado)] ??
                            text(row, "estado")}
                        </StatusBadge>
                      </header>
                      {pending ? (
                        <p className="notice">
                          Esta solicitud no tiene voucher validado, por eso aún
                          no está activa y no tiene asistencia ni notas.
                        </p>
                      ) : (
                        <KeyFigures row={row} />
                      )}
                      <div className="actions">
                        <Button
                          aria-expanded={expanded}
                          disabled={loadingId === key}
                          onClick={() => void toggle(row)}
                        >
                          {loadingId === key
                            ? "Cargando…"
                            : expanded
                              ? `Ocultar intento ${attempt}`
                              : `Consultar intento ${attempt}`}
                        </Button>
                        {canResume && pending && (
                          <a
                            className="button primary"
                            href={`#/matriculas/${row.id}`}
                          >
                            Completar matrícula
                          </a>
                        )}
                      </div>
                      {expanded && details[key] && (
                        <EnrollmentDetail detail={details[key]} />
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
            <Pagination
              after={after}
              nextCursor={data.nextCursor}
              onChange={setAfter}
              firstLabel="Primeros intentos"
              nextLabel="Más intentos"
            />
          </>
        )
      )}
    </section>
  );
}
