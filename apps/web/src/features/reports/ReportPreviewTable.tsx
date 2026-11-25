import { academicConditionLabels } from "../../shared/academic-result";
import { StudentIdentity } from "../../shared/ui/AcademicCells";
import { DataTable } from "../../shared/ui/DataTable";
import { Feedback } from "../../shared/ui/Feedback";
import { StatusBadge, type BadgeTone } from "../../components/shared";
import { sessionDate } from "../attendance/model";
import { displayedGrade } from "../evaluation/grade-capture";
import { ActReportPreview } from "./ActReportPreview";
import type { ReportPreview, ReportRow } from "./model";
import "./reports.css";

type IndicatorUnitGroup = {
  evaluacion: string;
  pesoEvaluacion: string;
  indicators: ReportPreview["indicadores"];
};

function groupIndicatorsSequentially(
  indicadores: ReportPreview["indicadores"],
): IndicatorUnitGroup[] {
  const groups: IndicatorUnitGroup[] = [];
  for (const ind of indicadores) {
    const last = groups[groups.length - 1];
    if (last && last.evaluacion === ind.evaluacion) {
      last.indicators.push(ind);
    } else {
      groups.push({
        evaluacion: ind.evaluacion,
        pesoEvaluacion: ind.pesoEvaluacion,
        indicators: [ind],
      });
    }
  }
  return groups;
}

function shortUnitLabel(evaluacion: string): { code: string; title: string } {
  const colonIdx = evaluacion.indexOf(":");
  if (colonIdx > 0) {
    return {
      code: evaluacion.slice(0, colonIdx).trim(),
      title: evaluacion.slice(colonIdx + 1).trim(),
    };
  }
  const dashIdx = evaluacion.indexOf(" - ");
  if (dashIdx > 0) {
    return {
      code: evaluacion.slice(0, dashIdx).trim(),
      title: evaluacion.slice(dashIdx + 3).trim(),
    };
  }
  return { code: evaluacion.trim(), title: "" };
}

function formatWeightPct(raw: string): string {
  const n = Number(raw);
  return Number.isFinite(n) ? `${Number(n.toFixed(2))}%` : `${raw}%`;
}

function gradeValueClass(raw: string | null | undefined): string {
  if (raw === null || raw === undefined || raw.trim() === "") {
    return "matrix-grade-cell is-empty";
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) return "matrix-grade-cell";
  if (n >= 14) return "matrix-grade-cell is-high";
  if (n >= 11) return "matrix-grade-cell is-pass";
  return "matrix-grade-cell is-fail";
}

function conditionTone(cond: string | null | undefined): BadgeTone {
  if (cond === "APROBADO") return "emerald";
  if (cond === "DESAPROBADO") return "rose";
  if (cond === "RETIRADO_INASISTENCIA") return "amber";
  return "slate";
}

function MatrixOfficialPreview({ data }: { data: ReportPreview }) {
  const unitGroups = groupIndicatorsSequentially(data.indicadores);
  const unitStartIds = new Set(
    unitGroups.map((g) => g.indicators[0]?.id).filter(Boolean),
  );

  return (
    <div>
      <div className="matrix-toolbar">
        <div className="matrix-toolbar-row">
          <div className="matrix-toolbar-meta">
            <span className="matrix-toolbar-title">Matriz Detallada de Notas</span>
            <span>·</span>
            <span>
              {unitGroups.length} {unitGroups.length === 1 ? "unidad" : "unidades"}
            </span>
            <span>·</span>
            <span>{data.indicadores.length} indicadores</span>
            <span>·</span>
            <span>
              {data.items.length}{" "}
              {data.items.length === 1 ? "estudiante" : "estudiantes"} en esta página
            </span>
          </div>

          {unitGroups.length > 0 && (
            <details className="matrix-legend">
              <summary className="matrix-legend-summary">
                Ver leyenda de unidades e indicadores ({data.indicadores.length})
              </summary>
              <div className="matrix-legend-panel">
                {unitGroups.map((unit, uIdx) => (
                  <div
                    key={`${unit.evaluacion}-${uIdx}`}
                    className="matrix-legend-unit"
                  >
                    <div className="matrix-legend-unit-title">
                      <span>{unit.evaluacion}</span>
                      <span>{formatWeightPct(unit.pesoEvaluacion)}</span>
                    </div>
                    <ul className="matrix-legend-items">
                      {unit.indicators.map((ind) => (
                        <li key={ind.id}>
                          <span className="matrix-legend-code">{ind.codigo}</span>
                          <span>{ind.descripcion}</span>
                          <span className="matrix-legend-pct">
                            {formatWeightPct(ind.pesoIndicador)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>

      <div
        className="table-scroll matrix-table-scroll"
        tabIndex={0}
        role="region"
        aria-label="Tabla de vista previa de matriz de notas"
      >
        <table className="matrix-table">
          <caption className="sr-only">Vista previa de matriz de notas</caption>
          <thead>
            <tr>
              <th scope="col" rowSpan={2} className="matrix-col-num">
                N°
              </th>
              <th scope="col" rowSpan={2} className="matrix-col-student">
                Estudiante
              </th>
              <th scope="col" rowSpan={2} className="matrix-col-enrollment">
                Matrícula
              </th>
              {unitGroups.map((unit, unitIdx) => {
                const { code, title } = shortUnitLabel(unit.evaluacion);
                return (
                  <th
                    key={`${unit.evaluacion}-${unitIdx}`}
                    scope="colgroup"
                    colSpan={unit.indicators.length}
                    title={`${unit.evaluacion} (${formatWeightPct(unit.pesoEvaluacion)})`}
                    className={`matrix-th-unit ${unitIdx % 2 === 0 ? "is-even" : "is-odd"} matrix-unit-start`}
                  >
                    <div className="matrix-th-unit-inner">
                      <span className="matrix-th-unit-head">
                        <span>{code}</span>
                        <span className="matrix-th-unit-pct">
                          {formatWeightPct(unit.pesoEvaluacion)}
                        </span>
                      </span>
                      {title && (
                        <span className="matrix-th-unit-sub">{title}</span>
                      )}
                    </div>
                  </th>
                );
              })}
              <th
                scope="colgroup"
                colSpan={5}
                className="matrix-th-results-group matrix-results-start"
              >
                Resultados y Asistencia
              </th>
            </tr>
            <tr>
              {data.indicadores.map((indicator) => (
                <th
                  scope="col"
                  key={indicator.id}
                  title={`${indicator.evaluacion} · ${indicator.codigo}: ${indicator.descripcion} (${formatWeightPct(indicator.pesoEvaluacion)} / ${formatWeightPct(indicator.pesoIndicador)})`}
                  className={`matrix-th-indicator ${unitStartIds.has(indicator.id) ? "matrix-unit-start" : ""}`}
                >
                  <span className="matrix-ind-code">{indicator.codigo}</span>
                  <span className="matrix-ind-weight">
                    {formatWeightPct(indicator.pesoIndicador)}
                  </span>
                </th>
              ))}
              <th
                scope="col"
                className="matrix-th-result matrix-results-start"
              >
                Prom. exacto
              </th>
              <th
                scope="col"
                className="matrix-th-result matrix-th-official"
              >
                Nota oficial
              </th>
              <th scope="col" className="matrix-th-result">
                Inasist.
              </th>
              <th scope="col" className="matrix-th-result">
                Condición
              </th>
              <th scope="col" className="matrix-th-result">
                Estado
              </th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((row: ReportRow, index: number) => {
              const confirmed = Boolean(
                row.resultado?.confirmado_at && row.resultado.cierre_id,
              );
              const confirmedCondition = confirmed
                ? row.resultado?.condicion
                : null;
              const officialNote = row.resumenNotas.notaOficial;
              const officialClass =
                officialNote === null
                  ? "matrix-official-col is-empty"
                  : officialNote >= 11
                    ? "matrix-official-col is-pass"
                    : "matrix-official-col is-fail";

              return (
                <tr key={row.matriculaId}>
                  <td className="matrix-col-num">{index + 1}</td>
                  <td className="matrix-col-student">
                    <StudentIdentity
                      name={row.estudiante}
                      documentType={row.tipoDocumento}
                      documentNumber={row.documento}
                    />
                  </td>
                  <td className="matrix-col-enrollment">
                    {row.codigo}
                    <small className="attendance-document">
                      Intento {row.intento}
                    </small>
                  </td>
                  {data.indicadores.map((indicator) => {
                    const raw = row.notas[indicator.id] ?? null;
                    return (
                      <td
                        key={indicator.id}
                        className={`${gradeValueClass(raw)} ${unitStartIds.has(indicator.id) ? "matrix-unit-start" : ""}`}
                      >
                        {displayedGrade(raw)}
                      </td>
                    );
                  })}
                  <td className="matrix-result-avg matrix-results-start">
                    {displayedGrade(row.resumenNotas.promedio)}
                  </td>
                  <td className={officialClass}>
                    {officialNote ?? "Pendiente"}
                  </td>
                  <td className="matrix-result-att">
                    {row.resumenAsistencia.inasistenciaPct === null
                      ? "Pendiente"
                      : `${displayedGrade(row.resumenAsistencia.inasistenciaPct)} %`}
                  </td>
                  <td className="matrix-result-cond">
                    <StatusBadge
                      tone={conditionTone(confirmedCondition)}
                      dot={false}
                    >
                      {confirmedCondition
                        ? (academicConditionLabels[confirmedCondition] ??
                          "Pendiente")
                        : "Pendiente"}
                    </StatusBadge>
                  </td>
                  <td
                    className={`matrix-result-state ${confirmed ? "is-confirmed" : ""}`}
                  >
                    {confirmed
                      ? "Confirmado"
                      : row.resultado
                        ? "Histórico sin confirmar"
                        : "Pendiente"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {data.items.length === 0 && (
        <p className="empty">No hay matrículas activas o cerradas para este grupo.</p>
      )}
    </div>
  );
}

export function ReportPreviewTable({ data }: { data: ReportPreview }) {
  if (data.tipo === "ACTA_DEMOSTRACION") {
    return data.acta ? (
      <ActReportPreview sheet={data.acta} />
    ) : (
      <Feedback>No se pudo mostrar la hoja del acta.</Feedback>
    );
  }
  if (data.tipo === "MATRIZ_NOTAS") {
    return <MatrixOfficialPreview data={data} />;
  }
  if (data.tipo === "RESUMEN_PARTICIPANTES")
    return (
      <DataTable
        caption="Resumen de participantes"
        rows={[data.anexo]}
        rowKey={() => data.grupo.id}
        columns={[
          {
            key: "idioma",
            header: "Programa propuesto",
            cell: (row) => row.idioma,
          },
          { key: "nivel", header: "Nivel propuesto", cell: (row) => row.nivel },
          {
            key: "creditos",
            header: "Créditos",
            cell: (row) => displayedGrade(row.creditos),
          },
          {
            key: "horas",
            header: "Horas",
            cell: (row) => row.horas ?? "Pendiente",
          },
          {
            key: "inicio",
            header: "Inicio del periodo",
            cell: (row) => sessionDate(row.fechaInicio),
          },
          {
            key: "fin",
            header: "Fin del periodo",
            cell: (row) => sessionDate(row.fechaFin),
          },
          {
            key: "matriculados",
            header: "Intentos matriculados",
            cell: (row) => row.matriculados,
          },
          {
            key: "aprobados",
            header: "Aprobados confirmados",
            cell: (row) => row.aprobados ?? "Pendiente",
          },
        ]}
      />
    );
  return null;
}
