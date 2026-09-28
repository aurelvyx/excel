import { useEffect, useState } from "react";
import { api, errorText, text, type Page, type Row } from "../../shared/api";
import { Dialog } from "../../shared/Dialog";
type HistoryPage = Page & { opciones: Row[] };
const condition: Record<string, string> = {
  APROBADO: "Aprobado",
  DESAPROBADO: "Desaprobado",
  RETIRADO_INASISTENCIA: "Retirado por inasistencia",
};
function Result({ row }: { row: Row }) {
  const result = row.resultado as Record<string, unknown> | null;
  return result ? (
    <div className="notice">
      <p>
        {result.confirmadoAt ? "Resultado confirmado" : "Resultado provisional"}
        : {condition[text(result, "condicion")] ?? "Pendiente"}
      </p>
      <p>
        Promedio: {text(result, "promedio") || "Pendiente"} · Nota oficial:{" "}
        {text(result, "notaOficial") || "Pendiente"} · Inasistencia:{" "}
        {result.inasistenciaPct == null
          ? "Pendiente"
          : `${text(result, "inasistenciaPct")} %`}
      </p>
      <p>
        Tardanzas: {text(result, "tardanzas")} · Faltas equivalentes:{" "}
        {text(result, "faltasEquivalentes")}
      </p>
    </div>
  ) : (
    <p>Resultado pendiente de cálculo.</p>
  );
}
export function StudentHistory({ id }: { id: string }) {
  const [data, setData] = useState<HistoryPage>({
    items: [],
    nextCursor: null,
    opciones: [],
  });
  const [nivel, setNivel] = useState("");
  const [periodo, setPeriodo] = useState("");
  const [after, setAfter] = useState("");
  const [error, fail] = useState("");
  const [completed, finish] = useState("");
  const [retry, reload] = useState(0);
  const [detail, setDetail] = useState<Row | null>(null);
  const [opening, open] = useState(false);
  const key = `${id}:${nivel}:${periodo}:${after}:${retry}`;
  useEffect(() => {
    const abort = new AbortController();
    const query = new URLSearchParams({ limit: "20" });
    if (nivel) query.set("nivelId", nivel);
    if (periodo) query.set("periodoId", periodo);
    if (after) query.set("after", after);
    void api<HistoryPage>(`estudiantes/${id}/historial?${query}`, {
      signal: abort.signal,
    })
      .then((result) => {
        if (!abort.signal.aborted) {
          setData(result);
          fail("");
        }
      })
      .catch((e) => {
        if (!abort.signal.aborted) fail(errorText(e));
      })
      .finally(() => {
        if (!abort.signal.aborted) finish(key);
      });
    return () => abort.abort();
  }, [id, nivel, periodo, after, retry, key]);
  async function show(row: Row) {
    open(true);
    fail("");
    try {
      setDetail(await api<Row>(`estudiantes/${id}/historial/${row.id}`));
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
        <div>
          <label htmlFor="history-level">Nivel</label>
          <select
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
          </select>
        </div>
        <div>
          <label htmlFor="history-period">Periodo</label>
          <select
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
          </select>
        </div>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}{" "}
          <button onClick={() => reload((v) => v + 1)}>
            Reintentar historial
          </button>
        </p>
      )}
      {completed !== key ? (
        <p role="status">Cargando historial…</p>
      ) : (
        !error && (
          <>
            <div className="table-scroll">
              <table>
                <caption className="sr-only">Intentos académicos</caption>
                <thead>
                  <tr>
                    <th>Intento</th>
                    <th>Idioma y nivel</th>
                    <th>Periodo y grupo</th>
                    <th>Matrícula</th>
                    <th>Resultado</th>
                    <th>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((row) => (
                    <tr key={row.id}>
                      <td>Intento {text(row, "numero_intento")}</td>
                      <td>
                        {text(row, "idioma")} · {text(row, "nivel")}
                      </td>
                      <td>
                        {text(row, "periodo")} · {text(row, "grupo")}
                        <br />
                        {text(row, "turno")} · {text(row, "seccion")}
                      </td>
                      <td>
                        {text(row, "codigo")}
                        <br />
                        {text(row, "estado")}
                      </td>
                      <td>
                        <Result row={row} />
                      </td>
                      <td>
                        <button
                          disabled={opening}
                          onClick={() => void show(row)}
                        >
                          Consultar intento {text(row, "numero_intento")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.items.length && (
              <p className="empty">
                No hay intentos registrados para esta consulta.
              </p>
            )}
            <div className="actions">
              {after && (
                <button onClick={() => setAfter("")}>Primeros intentos</button>
              )}
              {data.nextCursor && (
                <button onClick={() => setAfter(data.nextCursor!)}>
                  Más intentos
                </button>
              )}
            </div>
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
          <h3>Asistencia registrada</h3>
          <p className="muted">
            P: presente · F: falta · T: tardanza · J: justificación. Las marcas
            originales no representan por sí solas el cálculo de inasistencia.
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Sesión</th>
                  <th>Marca</th>
                </tr>
              </thead>
              <tbody>
                {(detail.asistencias as Row[]).map((row) => (
                  <tr key={row.id}>
                    <td>{text(row, "fecha")}</td>
                    <td>{text(row, "estado")}</td>
                    <td>{text(row, "codigo") || "Sin registro"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!(detail.asistencias as Row[]).length && (
            <p>Sin sesiones registradas.</p>
          )}
          <h3>Notas registradas</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Evaluación</th>
                  <th>Indicador</th>
                  <th>Nota</th>
                </tr>
              </thead>
              <tbody>
                {(detail.notas as Row[]).map((row) => (
                  <tr key={row.id}>
                    <td>{text(row, "evaluacion")}</td>
                    <td>
                      {text(row, "descripcion")}
                      {!row.activo ? " (inactivo)" : ""}
                    </td>
                    <td>
                      {row.nota == null ? "Pendiente" : text(row, "nota")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!(detail.notas as Row[]).length && (
            <p>Sin evaluaciones registradas.</p>
          )}
        </Dialog>
      )}
    </section>
  );
}
