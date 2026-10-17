import type { Page } from "../../shared/api";
import { navigate } from "../../shared/navigation";
import { useApiQuery } from "../../shared/useApiQuery";
import { DataTable } from "../../shared/ui/DataTable";
import { ListPanel } from "../../shared/ui/ListPanel";
import { PageHeading } from "../../shared/ui/PageHeading";
import { Pagination } from "../../shared/ui/Pagination";
import { text } from "../../shared/api";
import { ReportLink } from "./ReportLink";

export function ReportsGroupsPage({ query }: { query: URLSearchParams }) {
  const after = query.get("after") ?? "";
  const { data, loading, error, reload } = useApiQuery<Page>(
    `grupos?limit=20&after=${after || "0"}`,
  );
  return (
    <section>
      <PageHeading
        eyebrow="Demostración · XLSX"
        title="Reportes"
        description="Selecciona un grupo para revisar y generar borradores de demostración de inglés o portugués."
      />
      <p className="notice">
        Las plantillas son propuestas pendientes de aprobación institucional.
      </p>
      <ListPanel
        loading={loading}
        loadingLabel="Cargando grupos…"
        error={error}
        onRetry={reload}
        empty={!data?.items.length}
        emptyDescription="No hay grupos disponibles para tu cuenta."
        pagination={
          <Pagination
            after={after}
            count={data?.items.length}
            nextCursor={data?.nextCursor ?? null}
            onChange={(cursor) =>
              navigate(`/reportes${cursor ? `?after=${cursor}` : ""}`)
            }
          />
        }
      >
        <DataTable
          caption="Grupos para reportes"
          rows={data?.items ?? []}
          rowKey={(row) => row.id}
          columns={[
            {
              key: "grupo",
              header: "Grupo",
              cell: (row) => text(row, "codigo"),
            },
            {
              key: "periodo",
              header: "Periodo",
              cell: (row) => text(row, "contexto.periodo") || "—",
            },
            {
              key: "idioma",
              header: "Idioma",
              cell: (row) => text(row, "contexto.idioma") || "—",
            },
            {
              key: "nivel",
              header: "Nivel",
              cell: (row) => text(row, "contexto.nivel") || "—",
            },
            {
              key: "actions",
              header: "Acciones",
              cell: (row) => <ReportLink groupId={row.id} />,
            },
          ]}
        />
      </ListPanel>
    </section>
  );
}
