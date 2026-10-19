import { useApiQuery } from "../../shared/useApiQuery";
import { navigate } from "../../shared/navigation";
import { PageHeading } from "../../shared/ui/PageHeading";
import { Facts } from "../../shared/ui/Facts";
import { DataTable } from "../../shared/ui/DataTable";
import { ListPanel } from "../../shared/ui/ListPanel";
import { Pagination } from "../../shared/ui/Pagination";
import { SelectField } from "../../shared/ui/Field";
import { Button } from "../../shared/ui/Button";
import { academicTime } from "../attendance/model";

type Backup = {
  id: string;
  tipo: "RESPALDO" | "RESTAURACION";
  estado: "INICIADO" | "EXITOSO" | "FALLIDO";
  ubicacion_logica: string;
  iniciado_at: string;
  finalizado_at: string | null;
  nombre_usuario: string | null;
  proceso_tecnico: string | null;
  detalle: string;
  tamano_bytes: string | null;
  verificacion_completa: boolean;
};
type Backups = {
  items: Backup[];
  nextCursor: string | null;
  ultimoRespaldo: Backup | null;
  ultimaVerificacion: Backup | null;
};
const types = { RESPALDO: "Respaldo", RESTAURACION: "Ensayo de restauración" };
const states = {
  INICIADO: "Sin resultado registrado",
  EXITOSO: "Exitoso",
  FALLIDO: "Fallido",
};

export function BackupsPage({ query }: { query: URLSearchParams }) {
  const tipo = query.get("tipo") ?? "";
  const estado = query.get("estado") ?? "";
  const after = query.get("after") ?? "";
  const search = new URLSearchParams({ limit: "20", after: after || "0" });
  if (tipo) search.set("tipo", tipo);
  if (estado) search.set("estado", estado);
  const { data, loading, error, reload } = useApiQuery<Backups>(
    `control/respaldos?${search}`,
  );
  function select(patch: { tipo?: string; estado?: string; after?: string }) {
    const next = new URLSearchParams();
    const filters = { tipo, estado, ...patch };
    if (filters.tipo) next.set("tipo", filters.tipo);
    if (filters.estado) next.set("estado", filters.estado);
    if (patch.after) next.set("after", patch.after);
    navigate(`/respaldos${next.size ? `?${next}` : ""}`);
  }
  return (
    <section>
      <PageHeading
        eyebrow="Administración"
        title="Respaldos"
        description="Consulta las copias registradas y sus ensayos de restauración."
      />
      <p className="notice">
        El responsable autorizado ejecuta los respaldos y las comprobaciones
        mediante el procedimiento del manual de operación. Un archivo generado
        requiere su propio ensayo de restauración.
      </p>
      <div className="panel panel-content">
        <SelectField
          id="backup-type"
          label="Tipo de operación"
          value={tipo}
          onChange={(event) => select({ tipo: event.target.value })}
        >
          <option value="">Todos</option>
          {Object.entries(types).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
        <SelectField
          id="backup-state"
          label="Resultado"
          value={estado}
          onChange={(event) => select({ estado: event.target.value })}
        >
          <option value="">Todos</option>
          {Object.entries(states).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
        <Button onClick={reload} disabled={loading}>
          Actualizar respaldos
        </Button>
      </div>
      <ListPanel
        loading={loading}
        loadingLabel="Consultando respaldos…"
        error={error}
        onRetry={reload}
        empty={false}
        emptyDescription="No hay operaciones registradas."
        pagination={null}
      >
        {data && (
          <>
            <section
              className="panel panel-content"
              aria-label="Últimas comprobaciones"
            >
              <Facts
                emptyLabel="Pendiente"
                items={[
                  [
                    "Última copia exitosa",
                    data.ultimoRespaldo?.finalizado_at
                      ? academicTime(data.ultimoRespaldo.finalizado_at)
                      : null,
                  ],
                  [
                    "Archivo de la última copia",
                    data.ultimoRespaldo?.ubicacion_logica,
                  ],
                  [
                    "Último ensayo de intento completo",
                    data.ultimaVerificacion?.finalizado_at
                      ? academicTime(data.ultimaVerificacion.finalizado_at)
                      : null,
                  ],
                  [
                    "Archivo del ensayo completo",
                    data.ultimaVerificacion?.ubicacion_logica,
                  ],
                ]}
              />
              <p className="muted">
                El ensayo corresponde al archivo indicado. Los filtros del
                historial no cambian estas referencias.
              </p>
            </section>
            <h2>Historial de operaciones</h2>
            <div className="panel">
              <DataTable
                caption="Operaciones de respaldo"
                rows={data.items}
                rowKey={(row) => row.id}
                emptyMessage="Todavía no hay operaciones para estos filtros."
                columns={[
                  {
                    key: "inicio",
                    header: "Inicio",
                    cell: (row) => academicTime(row.iniciado_at),
                  },
                  {
                    key: "tipo",
                    header: "Operación",
                    cell: (row) => types[row.tipo],
                  },
                  {
                    key: "estado",
                    header: "Resultado",
                    cell: (row) => states[row.estado],
                  },
                  {
                    key: "archivo",
                    header: "Archivo",
                    cell: (row) => row.ubicacion_logica,
                  },
                  {
                    key: "responsable",
                    header: "Responsable",
                    cell: (row) =>
                      row.nombre_usuario ?? `Proceso: ${row.proceso_tecnico}`,
                  },
                  {
                    key: "fin",
                    header: "Finalización",
                    cell: (row) =>
                      row.finalizado_at
                        ? academicTime(row.finalizado_at)
                        : "Pendiente",
                  },
                  {
                    key: "detalle",
                    header: "Comprobación",
                    cell: (row) => (
                      <>
                        {row.detalle}
                        {row.verificacion_completa && (
                          <small className="attendance-document">
                            Intento académico completo comprobado
                          </small>
                        )}
                      </>
                    ),
                  },
                  {
                    key: "bytes",
                    header: "Tamaño",
                    cell: (row) =>
                      row.tamano_bytes
                        ? `${BigInt(row.tamano_bytes).toLocaleString("es-PE")} bytes`
                        : "Pendiente",
                  },
                ]}
              />
              <Pagination
                after={after}
                count={data.items.length}
                nextCursor={data.nextCursor}
                onChange={(cursor) => select({ after: cursor })}
              />
            </div>
          </>
        )}
      </ListPanel>
    </section>
  );
}
