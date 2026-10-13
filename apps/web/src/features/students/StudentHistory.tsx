import { SelectField } from "../../shared/ui/Field";
import { Feedback, Loading } from "../../shared/ui/Feedback";
import { Pagination } from "../../shared/ui/Pagination";
import { DataTable } from "../../shared/ui/DataTable";
import { useApiQuery } from "../../shared/useApiQuery";
import { Button } from "../../shared/ui/Button";
import { useState } from "react";
import { api, errorText, text, type Page, type Row } from "../../shared/api";
import { Dialog } from "../../shared/Dialog";
import { AttendanceSummary } from "../attendance/AttendanceSummary";
import type { AttendanceSummaryData } from "../attendance/model";
type HistoryRow = Row & { resumenAsistencia?: AttendanceSummaryData };
type HistoryPage = Omit<Page, "items"> & {
  items: HistoryRow[];
  opciones: Row[];
};
const condition: Record<string, string> = {
  APROBADO: "Aprobado",
  DESAPROBADO: "Desaprobado",
  RETIRADO_INASISTENCIA: "Retirado por inasistencia",
};
function Result({ row }: { row: Row }) {
  const result = row.resultado as Record<string, unknown> | null;
  if (!result) return <p>Resultado pendiente de cálculo.</p>;
  const attendanceLabel = `Asistencia del resultado ${result.confirmadoAt ? "confirmado" : "provisional"}`;
  return (
    <div className="notice">
      <p>
        {result.confirmadoAt ? "Resultado confirmado" : "Resultado provisional"}
        : {condition[text(result, "condicion")] ?? "Pendiente"}
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
  const [detail, setDetail] = useState<HistoryRow | null>(null);
  const [opening, open] = useState(false);
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
  async function show(row: Row) {
    open(true);
    fail("");
    try {
      setDetail(await api<HistoryRow>(`estudiantes/${id}/historial/${row.id}`));
    } catch (e) {
      fail(errorText(e));
    } finally {
      open(false);
    }
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
        Cada matrícula corresponde al nivel completo. Las marcas y notas
        pertenecen únicamente al intento indicado.
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
            <DataTable
              caption="Intentos académicos"
              rows={data.items}
              rowKey={(row) => row.id}
              emptyMessage="No hay intentos registrados para esta consulta."
              columns={[
                {
                  key: "intento",
                  header: "Intento",
                  cell: (row) => `Intento ${text(row, "numero_intento")}`,
                },
                {
                  key: "nivel",
                  header: "Idioma y nivel",
                  cell: (row) =>
                    `${text(row, "idioma")} · ${text(row, "nivel")}`,
                },
                {
                  key: "grupo",
                  header: "Periodo y grupo",
                  cell: (row) => (
                    <>
                      {text(row, "periodo")} · {text(row, "grupo")}
                      <br />
                      {text(row, "turno")} · {text(row, "seccion")}
                    </>
                  ),
                },
                {
                  key: "matricula",
                  header: "Matrícula",
                  cell: (row) => (
                    <>
                      {text(row, "codigo")}
                      <br />
                      {text(row, "estado")}
                    </>
                  ),
                },
                {
                  key: "asistencia",
                  header: "Resumen de asistencia",
                  className: "attendance-calculation",
                  cell: (row) => (
                    <AttendanceSummary
                      summary={row.resumenAsistencia}
                      label={`Resumen de asistencia del intento ${text(row, "numero_intento")}`}
                      compact
                    />
                  ),
                },
                {
                  key: "resultado",
                  header: "Resultado",
                  cell: (row) => <Result row={row} />,
                },
                {
                  key: "detalle",
                  header: "Detalle",
                  cell: (row) => (
                    <>
                      <Button disabled={opening} onClick={() => void show(row)}>
                        Consultar intento {text(row, "numero_intento")}
                      </Button>
                      {canResume && row.estado === "PENDIENTE" && (
                        <a className="button" href={`#/matriculas/${row.id}`}>
                          Retomar solicitud
                        </a>
                      )}
                    </>
                  ),
                },
              ]}
            />
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
      {detail && (
        <Dialog
          title={`Intento ${text(detail, "numero_intento")} · ${text(detail, "nivel")}`}
          onClose={() => setDetail(null)}
        >
          <p>
            {text(detail, "idioma")} · {text(detail, "periodo")} ·{" "}
            {text(detail, "grupo")} · {text(detail, "turno")} ·{" "}
            {text(detail, "seccion")}
          </p>
          <p>
            Matrícula {text(detail, "codigo")} · {text(detail, "estado")}
          </p>
          <Result row={detail} />
          <AttendanceSummary
            summary={detail.resumenAsistencia}
            label="Resumen de asistencia guardada"
          />
          <h3>Asistencia registrada</h3>
          <p className="muted">
            P: presente · F: falta · T: tardanza · J: justificación. Las marcas
            originales no representan por sí solas el cálculo de inasistencia.
          </p>
          <DataTable
            caption="Asistencia registrada"
            rows={detail.asistencias as Row[]}
            rowKey={(row) => row.id}
            emptyMessage="Sin sesiones registradas."
            columns={[
              {
                key: "fecha",
                header: "Fecha",
                cell: (row) => text(row, "fecha"),
              },
              {
                key: "sesion",
                header: "Sesión",
                cell: (row) => text(row, "estado"),
              },
              {
                key: "computable",
                header: "Computa en asistencia",
                cell: (row) => (row.computable ? "Sí" : "No"),
              },
              {
                key: "marca",
                header: "Marca",
                cell: (row) => text(row, "codigo") || "Sin registro",
              },
            ]}
          />
          <h3>Notas registradas</h3>
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
        </Dialog>
      )}
    </section>
  );
}
