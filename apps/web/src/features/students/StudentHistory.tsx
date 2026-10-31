import { SelectField } from "../../shared/ui/Field";
import { Feedback, Loading } from "../../shared/ui/Feedback";
import { Pagination } from "../../shared/ui/Pagination";
import { DataTable } from "../../shared/ui/DataTable";
import { StatusBadge } from "../../shared/ui/StatusBadge";
import { useApiQuery } from "../../shared/useApiQuery";
import { Button } from "../../shared/ui/Button";
import { useState } from "react";
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
  return (
    <dl className="enrollment-figures">
      <div>
        <dt>Inasistencia</dt>
        <dd>{absence}</dd>
      </div>
      <div>
        <dt>Promedio</dt>
        <dd>{average ? average : "Pendiente"}</dd>
      </div>
      <div>
        <dt>Notas registradas</dt>
        <dd>
          {grades
            ? `${grades.calificacionesRegistradas} de ${grades.calificacionesEsperadas}`
            : "—"}
        </dd>
      </div>
      <div>
        <dt>Resultado</dt>
        <dd>
          <ResultBadge row={row} />
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
        <h4>Notas</h4>
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
}: {
  id: string;
  canResume?: boolean;
}) {
  const [nivel, setNivel] = useState("");
  const [periodo, setPeriodo] = useState("");
  const [after, setAfter] = useState("");
  const [actionError, fail] = useState("");
  const [details, setDetails] = useState<Record<string, HistoryRow>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
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
      <h2>Historial académico</h2>
      <p className="muted">
        Una tarjeta por matrícula, agrupada por periodo. Cada matrícula cubre el
        nivel completo; las marcas y notas pertenecen solo al intento indicado.
      </p>
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
              <p className="muted">
                No hay intentos registrados para esta consulta.
              </p>
            ) : (
              <ol className="enrollment-list" aria-label="Intentos académicos">
                {data.items.map((row) => {
                  const key = String(row.id);
                  const expanded = openId === key;
                  const pending = row.estado === "PENDIENTE";
                  const attempt = text(row, "numero_intento");
                  return (
                    <li key={key} className="enrollment-card">
                      <header>
                        <div>
                          <p className="eyebrow">
                            {text(row, "periodo")} · Intento {attempt}
                          </p>
                          <h3>
                            {text(row, "idioma")} · {text(row, "nivel")}
                          </h3>
                          <p className="muted">
                            Grupo {text(row, "grupo")} · {text(row, "turno")} ·
                            Sección {text(row, "seccion")} · Matrícula{" "}
                            {text(row, "codigo")}
                          </p>
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
