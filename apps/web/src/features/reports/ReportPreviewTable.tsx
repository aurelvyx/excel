import { academicConditionLabels } from "../../shared/academic-result";
import { StudentIdentity } from "../../shared/ui/AcademicCells";
import { DataTable } from "../../shared/ui/DataTable";
import { Facts } from "../../shared/ui/Facts";
import { sessionDate } from "../attendance/model";
import { displayedGrade } from "../evaluation/grade-capture";
import type { ReportPreview } from "./model";

export function ReportPreviewTable({ data }: { data: ReportPreview }) {
  if (data.tipo === "ACTA_DEMOSTRACION")
    return <DemonstrationAct data={data} />;
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

function DemonstrationAct({ data }: { data: ReportPreview }) {
  const { grupo, anexo, resumen } = data;
  return (
    <div className="report-act-preview">
      <header className="report-act-title">
        <h3>ACTA DE EVALUACIÓN · {grupo.contexto.periodo}</h3>
        <strong>BORRADOR · Formato de demostración</strong>
      </header>
      <div className="report-act-metadata">
        <section>
          <h4>Centro y grupo</h4>
          <Facts
            items={[
              ["Centro", "Centro de Idiomas Excel"],
              ["Código de grupo", grupo.codigo],
              ["Datos institucionales", "Pendientes de aprobación"],
            ]}
          />
        </section>
        <section>
          <h4>Programa y periodo</h4>
          <Facts
            items={[
              ["Idioma", anexo.idioma],
              ["Nivel", anexo.nivel],
              ["Inicio", sessionDate(anexo.fechaInicio)],
              ["Fin", sessionDate(anexo.fechaFin)],
              [
                "Turno / sección",
                `${grupo.contexto.turno} / ${grupo.contexto.seccion}`,
              ],
            ]}
          />
        </section>
        <section>
          <h4>Resumen del grupo completo</h4>
          <Facts
            emptyLabel="Pendiente"
            items={[
              ["Matriculados", resumen.matriculas],
              ["Aprobados", resumen.aprobados],
              ["Desaprobados", resumen.desaprobados],
              ["Retirados", resumen.retirados],
              ["Créditos", anexo.creditos],
              ["Horas", anexo.horas],
            ]}
          />
        </section>
      </div>
      <DataTable
        caption="Nómina del acta de evaluación de demostración"
        rows={data.items}
        rowKey={(row) => row.matriculaId}
        columns={[
          {
            key: "documento",
            header: "Documento",
            cell: (row) => `${row.tipoDocumento} ${row.documento}`,
          },
          {
            key: "estudiante",
            header: "Apellidos y nombres",
            cell: (row) => row.estudiante,
          },
          ...data.componentes.map((component) => ({
            key: component.id,
            header: (
              <>
                {component.nombre}
                <small className="attendance-document">
                  Peso {component.pesoPct}%
                </small>
              </>
            ),
            cell: (row: ReportPreview["items"][number]) =>
              displayedGrade(row.notasComponentes[component.id] ?? null),
          })),
          {
            key: "promedio",
            header: "Promedio exacto",
            cell: (row) => displayedGrade(row.resumenNotas.promedio),
          },
          {
            key: "nota",
            header: "Nota calculada",
            cell: (row) => row.resumenNotas.notaOficial ?? "Pendiente",
          },
          {
            key: "condicion",
            header: "Condición confirmada",
            cell: (row) =>
              row.resultado?.condicion
                ? academicConditionLabels[row.resultado.condicion]
                : "Pendiente de confirmación",
          },
          {
            key: "observacion",
            header: "Matrícula / intento",
            cell: (row) => `${row.codigo} · intento ${row.intento}`,
          },
        ]}
      />
      <p className="notice">
        Los componentes proceden de los criterios aprobados del grupo. La
        equivalencia con unidades oficiales sigue pendiente de aprobación. La
        nota y la condición proceden del servidor.
      </p>
      <footer className="report-act-signatures">
        <span>Administración</span>
        <span>Docente asignado</span>
        <span>Coordinación</span>
      </footer>
    </div>
  );
}
