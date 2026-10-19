import { useState } from "react";
import { useApiQuery } from "../../shared/useApiQuery";
import { DataTable } from "../../shared/ui/DataTable";
import { ListPanel } from "../../shared/ui/ListPanel";
import { Pagination } from "../../shared/ui/Pagination";
import { academicTime } from "../attendance/model";
import { reportNames, type ReportHistory as History } from "./model";

export function ReportHistory({ groupId }: { groupId: string }) {
  const [after, setAfter] = useState("");
  const { data, loading, error, reload } = useApiQuery<History>(
    `reportes/grupos/${groupId}/exportaciones?limit=20&after=${after || "0"}`,
  );
  return (
    <section aria-label="Historial de exportaciones">
      <h2>Historial de exportaciones</h2>
      <p className="muted">
        Registra la generación del archivo; la recepción de la descarga depende
        del navegador.
      </p>
      <ListPanel
        loading={loading}
        loadingLabel="Cargando historial…"
        error={error}
        onRetry={reload}
        empty={!data?.items.length}
        emptyDescription="Todavía no se generaron archivos para este grupo."
        pagination={
          <Pagination
            after={after}
            count={data?.items.length}
            nextCursor={data?.nextCursor ?? null}
            onChange={setAfter}
            firstLabel="Primeras exportaciones"
            nextLabel="Más exportaciones"
          />
        }
      >
        <DataTable
          caption="Historial de exportaciones"
          rows={data?.items ?? []}
          rowKey={(row) => row.id}
          columns={[
            {
              key: "fecha",
              header: "Generado",
              cell: (row) => academicTime(row.generado_at),
            },
            {
              key: "usuario",
              header: "Usuario",
              cell: (row) => row.nombre_usuario,
            },
            {
              key: "tipo",
              header: "Reporte",
              cell: (row) => reportNames[row.tipo],
            },
            {
              key: "archivo",
              header: "Archivo",
              cell: (row) => row.archivo_nombre,
            },
            {
              key: "filas",
              header: "Intentos incluidos",
              cell: (row) => row.filas,
            },
            {
              key: "plantilla",
              header: "Plantilla",
              cell: (row) =>
                `${row.plantilla_id} · versión ${row.plantilla_version}`,
            },
            { key: "modo", header: "Modo", cell: () => "Borrador" },
          ]}
        />
      </ListPanel>
    </section>
  );
}
