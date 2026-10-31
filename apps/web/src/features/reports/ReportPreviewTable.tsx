import { academicConditionLabels } from "../../shared/academic-result";
import { StudentIdentity } from "../../shared/ui/AcademicCells";
import { DataTable } from "../../shared/ui/DataTable";
import { sessionDate } from "../attendance/model";
import { displayedGrade } from "../evaluation/grade-capture";
import type { ReportPreview, ReportRow } from "./model";

function groupIndicatorsForUgel(indicadores: ReportPreview["indicadores"]) {
  if (!indicadores.length) return [];
  const byEval = new Map<string, ReportPreview["indicadores"]>();
  for (const ind of indicadores) {
    const list = byEval.get(ind.evaluacion) ?? [];
    list.push(ind);
    byEval.set(ind.evaluacion, list);
  }
  if (byEval.size >= 2) {
    return Array.from(byEval.entries())
      .slice(0, 5)
      .map(([name, group]) => ({ label: name, group }));
  }
  return indicadores.slice(0, 5).map((ind) => ({
    label: `${ind.codigo}: ${ind.descripcion}`,
    group: [ind],
  }));
}

function computeUnitGrade(
  notas: Record<string, string | null>,
  group: ReportPreview["indicadores"],
): number | null {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const ind of group) {
    const raw = notas[ind.id];
    if (raw === null || raw === undefined) continue;
    const val = Number(raw);
    const weight = Number(ind.pesoIndicador) || 1;
    weightedSum += val * weight;
    totalWeight += weight;
  }
  if (totalWeight === 0) return null;
  return Math.round(weightedSum / totalWeight);
}

function UgelOfficialPreview({ data }: { data: ReportPreview }) {
  const { anexo, grupo, indicadores, items, resumen } = data;
  const evalGroups = groupIndicatorsForUgel(indicadores);
  const defaultUnitHeaders = [
    "UD01: Unidad Didáctica 1",
    "UD02: Unidad Didáctica 2",
    "UD03: Unidad Didáctica 3",
    "UD04: Unidad Didáctica 4",
    "EFSRT / UD05",
  ];

  const sortedItems = [...items].sort((a, b) =>
    a.estudiante.localeCompare(b.estudiante, "es", { sensitivity: "base" }),
  );

  const rowsWithComputed = sortedItems.map((item, idx) => {
    let sum = 0;
    let count = 0;
    const unitGrades = [0, 1, 2, 3, 4].map((slotIdx) => {
      const slot = evalGroups[slotIdx];
      if (!slot) return null;
      const g = computeUnitGrade(item.notas, slot.group);
      if (g !== null) {
        sum += g;
        count += 1;
      }
      return g;
    });

    const notaOficial =
      item.resultado?.nota_oficial ??
      item.resumenNotas.notaOficial ??
      (count > 0 ? Math.round(sum / count) : null);

    const cond =
      item.resultado?.condicion ??
      (item.resumenAsistencia.excedeLimite
        ? "RETIRADO_INASISTENCIA"
        : notaOficial !== null
          ? notaOficial >= 11
            ? "APROBADO"
            : "DESAPROBADO"
          : null);

    return {
      item,
      index: idx + 1,
      unitGrades,
      puntaje: count > 0 ? sum : null,
      promedio: notaOficial,
      cond,
    };
  });

  const aprobadosCount =
    resumen.aprobados ??
    rowsWithComputed.filter((r) => r.cond === "APROBADO").length;
  const desaprobadosCount =
    resumen.desaprobados ??
    rowsWithComputed.filter((r) => r.cond === "DESAPROBADO").length;
  const retiradosCount =
    resumen.retirados ??
    rowsWithComputed.filter((r) => r.cond === "RETIRADO_INASISTENCIA").length;

  const programaNombre = `${anexo.idioma} ${anexo.nivel}`.toUpperCase();

  return (
    <div style={{ padding: "1rem" }}>
      {/* Cabecera Réplica del Formato Oficial UGEL / MINEDU */}
      <div
        style={{
          border: "2px solid #1e293b",
          borderRadius: "0.375rem",
          overflow: "hidden",
          marginBottom: "1rem",
          backgroundColor: "#ffffff",
          fontSize: "0.75rem",
        }}
      >
        <div
          style={{
            backgroundColor: "#f1f5f9",
            borderBottom: "2px solid #1e293b",
            padding: "0.65rem 1rem",
            textAlign: "center",
            fontWeight: 800,
            fontSize: "0.9375rem",
            letterSpacing: "0.03em",
            color: "#0f172a",
          }}
        >
          ACTA DE EVALUACIÓN - {grupo.contexto.periodo || anexo.fechaInicio.slice(0, 4)} · EDUCACIÓN TÉCNICO PRODUCTIVA
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "0",
            borderBottom: "1px solid #cbd5e1",
          }}
        >
          {/* Columna 1: Datos Institucionales CETPRO */}
          <div style={{ padding: "0.75rem 1rem", borderRight: "1px solid #cbd5e1" }}>
            <div style={{ fontWeight: 700, color: "#475569", marginBottom: "0.35rem", textTransform: "uppercase", fontSize: "0.6875rem" }}>
              Datos Institucionales (UGEL Cusco)
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", rowGap: "0.2rem" }}>
              <span style={{ color: "#64748b" }}>GEREDU / UGEL:</span>
              <strong>CUSCO / CUSCO</strong>
              <span style={{ color: "#64748b" }}>CETPRO:</span>
              <strong>EXCEL (Código Modular: 0519785)</strong>
              <span style={{ color: "#64748b" }}>Dirección:</span>
              <span>Calle Cruz Verde N° 336 (Cusco)</span>
              <span style={{ color: "#64748b" }}>Resolución:</span>
              <span>RD N° 001-2025</span>
            </div>
          </div>

          {/* Columna 2: Programa y Periodo */}
          <div style={{ padding: "0.75rem 1rem", borderRight: "1px solid #cbd5e1" }}>
            <div style={{ fontWeight: 700, color: "#475569", marginBottom: "0.35rem", textTransform: "uppercase", fontSize: "0.6875rem" }}>
              Programa de Formación Continua
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", rowGap: "0.2rem" }}>
              <span style={{ color: "#64748b" }}>Programa / Módulo:</span>
              <strong style={{ color: "#007a3d" }}>{programaNombre}</strong>
              <span style={{ color: "#64748b" }}>Modalidad:</span>
              <strong>Presencial</strong>
              <span style={{ color: "#64748b" }}>Fecha Inicio / Fin:</span>
              <span>
                {sessionDate(anexo.fechaInicio)} al {sessionDate(anexo.fechaFin)}
              </span>
              <span style={{ color: "#64748b" }}>Turno / Sección:</span>
              <strong>
                {grupo.contexto.turno || "Noche"} · Sección {grupo.contexto.seccion || "A"}
              </strong>
            </div>
          </div>

          {/* Columna 3: Resumen Estadístico y Créditos */}
          <div style={{ padding: "0.75rem 1rem", backgroundColor: "#f8fafc" }}>
            <div style={{ fontWeight: 700, color: "#475569", marginBottom: "0.35rem", textTransform: "uppercase", fontSize: "0.6875rem" }}>
              Resumen Estadístico y Créditos
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", rowGap: "0.15rem" }}>
                <span style={{ color: "#64748b" }}>Matriculados:</span>
                <strong>{items.length}</strong>
                <span style={{ color: "#166534" }}>Aprobados (A):</span>
                <strong style={{ color: "#166534" }}>{aprobadosCount}</strong>
                <span style={{ color: "#dc2626" }}>Desaprobados (D):</span>
                <strong style={{ color: "#dc2626" }}>{desaprobadosCount}</strong>
                <span style={{ color: "#9a3412" }}>Retirados (R):</span>
                <strong style={{ color: "#9a3412" }}>{retiradosCount}</strong>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", rowGap: "0.15rem", borderLeft: "1px solid #e2e8f0", paddingLeft: "0.5rem" }}>
                <span style={{ color: "#64748b" }}>Créditos Mod.:</span>
                <strong>{anexo.creditos ?? "6"}</strong>
                <span style={{ color: "#64748b" }}>Horas Mod.:</span>
                <strong>{anexo.horas ?? "176"}</strong>
                <span style={{ color: "#64748b" }}>Periodo:</span>
                <strong>{grupo.contexto.periodo}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Tabla Oficial UGEL */}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
            <thead>
              <tr style={{ backgroundColor: "#e2e8f0", color: "#0f172a", borderBottom: "2px solid #1e293b" }}>
                <th style={{ padding: "0.5rem", borderRight: "1px solid #cbd5e1", width: "38px", textAlign: "center" }}>
                  N°
                </th>
                <th style={{ padding: "0.5rem", borderRight: "1px solid #cbd5e1", width: "110px", textAlign: "center" }}>
                  N° Documento
                </th>
                <th style={{ padding: "0.5rem 0.75rem", borderRight: "1px solid #cbd5e1", textAlign: "left", minWidth: "220px" }}>
                  APELLIDOS Y NOMBRES (en orden alfabético)
                </th>
                {[0, 1, 2, 3, 4].map((slotIdx) => {
                  const title = evalGroups[slotIdx]?.label ?? defaultUnitHeaders[slotIdx];
                  return (
                    <th
                      key={slotIdx}
                      title={title}
                      style={{
                        padding: "0.5rem 0.35rem",
                        borderRight: "1px solid #cbd5e1",
                        textAlign: "center",
                        width: "68px",
                        fontSize: "0.6875rem",
                      }}
                    >
                      UD 0{slotIdx + 1}
                      <div style={{ fontWeight: 400, fontSize: "0.625rem", color: "#475569", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "64px" }}>
                        {title}
                      </div>
                    </th>
                  );
                })}
                <th style={{ padding: "0.5rem 0.35rem", borderRight: "1px solid #cbd5e1", textAlign: "center", width: "58px", backgroundColor: "#f1f5f9" }}>
                  Puntaje
                </th>
                <th style={{ padding: "0.5rem 0.35rem", borderRight: "1px solid #cbd5e1", textAlign: "center", width: "62px", backgroundColor: "#f1f5f9" }}>
                  Promed.
                </th>
                <th style={{ padding: "0.5rem 0.25rem", borderRight: "1px solid #cbd5e1", textAlign: "center", width: "32px", color: "#166534" }} title="Aprobado">
                  A
                </th>
                <th style={{ padding: "0.5rem 0.25rem", borderRight: "1px solid #cbd5e1", textAlign: "center", width: "32px", color: "#dc2626" }} title="Desaprobado">
                  D
                </th>
                <th style={{ padding: "0.5rem 0.25rem", borderRight: "1px solid #cbd5e1", textAlign: "center", width: "32px", color: "#9a3412" }} title="Retirado por inasistencia">
                  R
                </th>
                <th style={{ padding: "0.5rem 0.75rem", textAlign: "left" }}>
                  OBSERVACIONES
                </th>
              </tr>
            </thead>
            <tbody>
              {rowsWithComputed.length === 0 ? (
                <tr>
                  <td colSpan={14} style={{ padding: "2rem", textAlign: "center", color: "#64748b" }}>
                    No hay matrículas registradas en este grupo.
                  </td>
                </tr>
              ) : (
                rowsWithComputed.map(({ item, index, unitGrades, puntaje, promedio, cond }) => (
                  <tr key={item.matriculaId} style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <td style={{ padding: "0.45rem 0.5rem", borderRight: "1px solid #e2e8f0", textAlign: "center", fontWeight: 600, color: "#475569" }}>
                      {index}
                    </td>
                    <td style={{ padding: "0.45rem 0.5rem", borderRight: "1px solid #e2e8f0", textAlign: "center", fontFamily: "monospace", fontWeight: 600 }}>
                      {item.documento}
                    </td>
                    <td style={{ padding: "0.45rem 0.75rem", borderRight: "1px solid #e2e8f0", fontWeight: 700, color: "#0f172a" }}>
                      {item.estudiante.toUpperCase()}
                    </td>
                    {unitGrades.map((g, idx) => (
                      <td
                        key={idx}
                        style={{
                          padding: "0.45rem 0.35rem",
                          borderRight: "1px solid #e2e8f0",
                          textAlign: "center",
                          fontWeight: 600,
                          color: g === null ? "#cbd5e1" : g >= 11 ? "#1e293b" : "#dc2626",
                        }}
                      >
                        {g ?? "—"}
                      </td>
                    ))}
                    <td style={{ padding: "0.45rem 0.35rem", borderRight: "1px solid #e2e8f0", textAlign: "center", fontWeight: 700, backgroundColor: "#f8fafc" }}>
                      {puntaje ?? "—"}
                    </td>
                    <td
                      style={{
                        padding: "0.45rem 0.35rem",
                        borderRight: "1px solid #e2e8f0",
                        textAlign: "center",
                        fontWeight: 800,
                        backgroundColor: "#f8fafc",
                        color: promedio === null ? "#64748b" : promedio >= 11 ? "#166534" : "#dc2626",
                      }}
                    >
                      {promedio ?? "—"}
                    </td>
                    <td style={{ padding: "0.45rem 0.25rem", borderRight: "1px solid #e2e8f0", textAlign: "center", fontWeight: 800, color: "#166534" }}>
                      {cond === "APROBADO" ? "X" : ""}
                    </td>
                    <td style={{ padding: "0.45rem 0.25rem", borderRight: "1px solid #e2e8f0", textAlign: "center", fontWeight: 800, color: "#dc2626" }}>
                      {cond === "DESAPROBADO" ? "X" : ""}
                    </td>
                    <td style={{ padding: "0.45rem 0.25rem", borderRight: "1px solid #e2e8f0", textAlign: "center", fontWeight: 800, color: "#9a3412" }}>
                      {cond === "RETIRADO_INASISTENCIA" ? "X" : ""}
                    </td>
                    <td style={{ padding: "0.45rem 0.75rem", fontSize: "0.6875rem", color: "#64748b" }}>
                      {cond === "RETIRADO_INASISTENCIA" ? "Inhabilitado por inasistencia (DPI)" : ""}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function ReportPreviewTable({ data }: { data: ReportPreview }) {
  if (data.tipo === "ACTA_UGEL") {
    return <UgelOfficialPreview data={data} />;
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
  return (
    <DataTable
      caption="Vista previa de matriz de notas"
      rows={data.items}
      rowKey={(row) => row.matriculaId}
      emptyMessage="No hay matrículas activas o cerradas para este grupo."
      columns={[
        {
          key: "estudiante",
          header: "Estudiante",
          cell: (row: ReportRow) => (
            <StudentIdentity
              name={row.estudiante}
              documentType={row.tipoDocumento}
              documentNumber={row.documento}
            />
          ),
        },
        {
          key: "matricula",
          header: "Matrícula / intento",
          cell: (row: ReportRow) => (
            <>
              {row.codigo}
              <small className="attendance-document">
                Intento {row.intento}
              </small>
            </>
          ),
        },
        ...data.indicadores.map((indicator) => ({
          key: indicator.id,
          header: (
            <>
              {indicator.codigo}
              <small className="attendance-document">
                {indicator.evaluacion} · {indicator.pesoEvaluacion}% /{" "}
                {indicator.pesoIndicador}%
              </small>
            </>
          ),
          cell: (row: ReportRow) =>
            displayedGrade(row.notas[indicator.id] ?? null),
        })),
        {
          key: "promedio",
          header: "Promedio exacto",
          cell: (row: ReportRow) => displayedGrade(row.resumenNotas.promedio),
        },
        {
          key: "nota",
          header: "Nota oficial calculada",
          cell: (row: ReportRow) => row.resumenNotas.notaOficial ?? "Pendiente",
        },
        {
          key: "inasistencia",
          header: "Inasistencias",
          cell: (row: ReportRow) =>
            row.resumenAsistencia.inasistenciaPct === null
              ? "Pendiente"
              : `${displayedGrade(row.resumenAsistencia.inasistenciaPct)} %`,
        },
        {
          key: "condicion",
          header: "Condición confirmada",
          cell: (row: ReportRow) =>
            row.resultado?.confirmado_at && row.resultado.cierre_id
              ? (academicConditionLabels[row.resultado.condicion ?? ""] ??
                "Pendiente")
              : "Pendiente",
        },
        {
          key: "estado",
          header: "Estado del resultado",
          cell: (row: ReportRow) =>
            row.resultado?.confirmado_at && row.resultado.cierre_id
              ? "Confirmado"
              : row.resultado
                ? "Resultado histórico sin confirmar"
                : "Pendiente de cierre",
        },
      ]}
    />
  );
}
