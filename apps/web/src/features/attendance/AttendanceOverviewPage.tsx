import { useState } from "react";
import { api } from "../../shared/api";
import { useApiQuery } from "../../shared/useApiQuery";
import { Button } from "../../shared/ui/Button";
import { Feedback, Loading } from "../../shared/ui/Feedback";
import { SelectField } from "../../shared/ui/Field";
import { PageHeading } from "../../shared/ui/PageHeading";
import { GroupContext } from "./GroupContext";
import { safeAttendanceReturnTo, withAttendanceReturn } from "./navigation";
import { AttendanceCellDetailDialog } from "./AttendanceCellDetailDialog";
import {
  attendanceCodes,
  sessionDate,
  type AttendanceCode,
  type AttendancePageData,
  type AttendanceRow,
  type ClassSession,
  type SessionsPageData,
} from "./model";

type MatrixData = {
  group: SessionsPageData["grupo"];
  sessions: ClassSession[];
  students: AttendanceRow[];
  marks: Map<string, AttendanceCode>;
};

const monthNames = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function monthRange(from: string, to: string, sessions: ClassSession[]) {
  const start = /^(\d{4})-(\d{2})/.exec(from);
  const end = /^(\d{4})-(\d{2})/.exec(to);
  if (!start || !end) {
    return [...new Set(sessions.map((session) => session.fecha.slice(0, 7)))].sort();
  }
  let year = Number(start[1]);
  let month = Number(start[2]);
  const endYear = Number(end[1]);
  const endMonth = Number(end[2]);
  const months: string[] = [];
  while ((year < endYear || (year === endYear && month <= endMonth)) && months.length < 24) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  return `${monthNames[(month ?? 1) - 1]} ${year}`;
}

async function pages<T extends { items: unknown[]; nextCursor: string | null }>(
  endpoint: string,
  signal: AbortSignal,
) {
  const firstPage = await api<T>(`${endpoint}?limit=100`, { signal });
  const items = [...firstPage.items] as T["items"];
  let after = firstPage.nextCursor;
  while (after) {
    const search = new URLSearchParams({ limit: "100", after });
    const page = await api<T>(`${endpoint}?${search}`, { signal });
    items.push(...page.items);
    after = page.nextCursor;
  }
  return { firstPage, items };
}

async function loadMatrix(endpoint: string, signal: AbortSignal): Promise<MatrixData> {
  const { firstPage, items } = await pages<SessionsPageData>(endpoint, signal);
  const sessions = items.sort((a, b) => a.fecha.localeCompare(b.fecha));
  const marks = new Map<string, AttendanceCode>();
  const students = new Map<string, AttendanceRow>();
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(5, sessions.length) },
    async () => {
      while (cursor < sessions.length) {
        const session = sessions[cursor++];
        const { items: rows } = await pages<AttendancePageData>(
          `${endpoint}/${session!.id}/asistencias`,
          signal,
        );
        for (const row of rows) {
          students.set(row.matricula_id, row);
          if (row.asistencia)
            marks.set(`${row.matricula_id}:${session!.id}`, row.asistencia.codigo);
        }
      }
    },
  );
  await Promise.all(workers);
  return {
    group: firstPage.grupo,
    sessions,
    students: [...students.values()].sort((a, b) =>
      a.estudiante.localeCompare(b.estudiante, "es"),
    ),
    marks,
  };
}

export function AttendanceOverviewPage({
  groupId,
  query,
}: {
  groupId: string;
  query: URLSearchParams;
}) {
  const { data, loading, error, reload } = useApiQuery(
    `asistencia/grupos/${groupId}/sesiones`,
    loadMatrix,
  );
  const [selectedMonth, selectMonth] = useState(query.get("mes") ?? "");
  const [selectedCell, selectCell] = useState<{
    student: AttendanceRow;
    session: ClassSession;
    code: AttendanceCode | null;
  } | null>(null);

  const returnTo = safeAttendanceReturnTo(query.get("retorno"), groupId);
  const backHref = returnTo ?? `/asistencia/grupos/${groupId}`;
  const backLabel = returnTo?.startsWith("/salones/")
    ? "Volver al salón"
    : "Volver a sesiones";

  if (loading)
    return (
      <section>
        <PageHeading
          eyebrow="Asistencia"
          title="Matriz del grupo"
          description="Marcas de asistencia por estudiante y sesión."
        />
        <Loading>Cargando fechas y marcas de asistencia…</Loading>
      </section>
    );
  if (error || !data)
    return (
      <section>
        <a href={`#${backHref}`}>← {backLabel}</a>
        <PageHeading
          eyebrow="Asistencia"
          title="Matriz del grupo"
          description="Marcas de asistencia por estudiante y sesión."
        />
        <Feedback onRetry={reload}>
          {error || "No se pudo cargar la matriz."}
        </Feedback>
      </section>
    );

  const months = monthRange(data.group.fecha_inicio, data.group.fecha_fin, data.sessions);
  const activeMonth = months.includes(selectedMonth)
    ? selectedMonth
    : data.sessions[0]?.fecha.slice(0, 7) ?? months[0] ?? "";
  const monthSessions = data.sessions.filter(
    (session) => session.fecha.slice(0, 7) === activeMonth,
  );
  const matrixQuery = new URLSearchParams(query);
  matrixQuery.set("mes", activeMonth);
  const matrixPath = `/asistencia/grupos/${groupId}/matriz?${matrixQuery}`;

  return (
    <section>
      <a href={`#${backHref}`}>← {backLabel}</a>
      <PageHeading
        eyebrow="Asistencia"
        title="Matriz de asistencia"
        description="Elige un mes para consultar las marcas. Cada celda da acceso al registro de su sesión."
        action={
          <Button onClick={reload}>
            Actualizar matriz
          </Button>
        }
      />
      <GroupContext group={data.group} />
      <section className="attendance-month-panel" aria-label="Mes de asistencia">
        <SelectField
          label="Mes del periodo"
          value={activeMonth}
          onChange={(event) => selectMonth(event.target.value)}
          disabled={!months.length}
        >
          {months.map((month) => (
            <option key={month} value={month}>{monthLabel(month)}</option>
          ))}
        </SelectField>
        <p>
          <strong>{monthSessions.length}</strong>
          {monthSessions.length === 1 ? " sesión en " : " sesiones en "}
          <span>{activeMonth ? monthLabel(activeMonth) : "este periodo"}</span>
        </p>
      </section>
      <div className="attendance-legend" aria-label="Leyenda de asistencia">
        {(["P", "F", "T", "J"] as const).map((code) => (
          <span className={`attendance-legend-item mark-${code}`} key={code}>
            <b>{code}</b> {attendanceCodes[code]}
          </span>
        ))}
        <span className="attendance-legend-item">
          <b>·</b> Sin registrar
        </span>
      </div>
      {!data.sessions.length ? (
        <p className="readonly">Este grupo todavía no tiene sesiones.</p>
      ) : !data.students.length ? (
        <p className="readonly">Este grupo todavía no tiene matrículas activas.</p>
      ) : !monthSessions.length ? (
        <p className="readonly">
          No hay sesiones programadas para {activeMonth ? monthLabel(activeMonth) : "este mes"}.
        </p>
      ) : (
        <div className="attendance-grid-scroll" role="region" aria-label="Matriz de asistencia por fecha" tabIndex={0}>
          <table className="attendance-grid">
            <thead>
              <tr>
                <th className="attendance-grid-student" scope="col">N.º · Estudiante</th>
                {monthSessions.map((session, index) => (
                  <th className="attendance-grid-date" scope="col" key={session.id}>
                    <span title={`Asistencia del ${sessionDate(session.fecha)}`}>
                      <span>{session.estado === "CANCELADA" ? "Cancelada" : sessionDate(session.fecha)}</span>
                      <small>{index + 1}</small>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.students.map((student, index) => (
                <tr key={student.matricula_id}>
                  <th className="attendance-grid-student" scope="row">
                    <span className="attendance-grid-number">{index + 1}</span>
                    <span>
                      <strong>{student.estudiante}</strong>
                      <small>{student.codigo_matricula}</small>
                    </span>
                  </th>
                  {monthSessions.map((session) => {
                    const code = data.marks.get(`${student.matricula_id}:${session.id}`);
                    return (
                      <td key={session.id}>
                        <button
                          type="button"
                          className={`attendance-grid-cell ${code ? `mark-${code}` : "mark-empty"}`}
                          onClick={() => selectCell({ student, session, code: code ?? null })}
                          aria-label={`${student.estudiante}, ${sessionDate(session.fecha)}: ${code ? attendanceCodes[code] : "sin registrar"}. Ver detalle`}
                          title={`${student.estudiante} · ${sessionDate(session.fecha)} · ${code ? attendanceCodes[code] : "Sin registrar"}`}
                        >
                          {code ?? "·"}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="attendance-grid-note">
        Las celdas sin marca están pendientes de registro. Las fechas canceladas se muestran como referencia.
      </p>
      {selectedCell && (
        <AttendanceCellDetailDialog
          student={selectedCell.student}
          session={selectedCell.session}
          code={selectedCell.code}
          sessionPath={withAttendanceReturn(
            `/asistencia/grupos/${groupId}/sesiones/${selectedCell.session.id}`,
            matrixPath,
          )}
          onClose={() => selectCell(null)}
        />
      )}
    </section>
  );
}
