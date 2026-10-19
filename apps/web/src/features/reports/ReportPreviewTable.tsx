import { academicConditionLabels } from "../../shared/academic-result";
import { StudentIdentity } from "../../shared/ui/AcademicCells";
import { DataTable } from "../../shared/ui/DataTable";
import { sessionDate } from "../attendance/model";
import { displayedGrade } from "../evaluation/grade-capture";
import type { ReportPreview } from "./model";

export function ReportPreviewTable({ data }: { data: ReportPreview }) {
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
          cell: (row) => (
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
          cell: (row) => (
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
          cell: (row: ReportPreview["items"][number]) =>
            displayedGrade(row.notas[indicator.id] ?? null),
        })),
        {
          key: "promedio",
          header: "Promedio exacto",
          cell: (row) => displayedGrade(row.resumenNotas.promedio),
        },
        {
          key: "nota",
          header: "Nota oficial calculada",
          cell: (row) => row.resumenNotas.notaOficial ?? "Pendiente",
        },
        {
          key: "inasistencia",
          header: "Inasistencias",
          cell: (row) =>
            row.resumenAsistencia.inasistenciaPct === null
              ? "Pendiente"
              : `${displayedGrade(row.resumenAsistencia.inasistenciaPct)} %`,
        },
        {
          key: "condicion",
          header: "Condición confirmada",
          cell: (row) =>
            row.resultado?.confirmado_at && row.resultado.cierre_id
              ? (academicConditionLabels[row.resultado.condicion ?? ""] ??
                "Pendiente")
              : "Pendiente",
        },
        {
          key: "estado",
          header: "Estado del resultado",
          cell: (row) =>
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
