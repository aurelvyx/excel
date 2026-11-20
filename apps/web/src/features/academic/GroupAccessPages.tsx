import type { Page, Row } from "../../shared/api";
import { text } from "../../shared/api";
import { navigate } from "../../shared/navigation";
import { useApiQuery } from "../../shared/useApiQuery";
import { DataTable } from "../../shared/ui/DataTable";
import { ListPanel } from "../../shared/ui/ListPanel";
import { PageHeading } from "../../shared/ui/PageHeading";
import { Pagination } from "../../shared/ui/Pagination";
import { SelectField } from "../../shared/ui/Field";
import { StatusBadge } from "../../shared/ui/StatusBadge";

type Activity = "asistencia" | "calificaciones" | "actas";
const headings: Record<Activity, { title: string; description: string }> = {
  asistencia: {
    title: "Asistencias de mis grupos",
    description:
      "Elige un grupo para consultar sus sesiones y registrar las marcas de asistencia.",
  },
  calificaciones: {
    title: "Calificaciones de mis grupos",
    description:
      "Cada grupo muestra su propio padrón y los criterios aplicados a su nivel.",
  },
  actas: {
    title: "Actas de evaluación",
    description:
      "Consulta las actas y resultados de todos los grupos, incluidos los cerrados.",
  },
};

export function GroupAccessPage({
  activity,
  query,
}: {
  activity: Activity;
  query: URLSearchParams;
}) {
  const after = query.get("after") ?? "";
  const state = query.get("estado") ?? "";
  const search = new URLSearchParams({ limit: "20" });
  if (after) search.set("after", after);
  if (state) search.set("estado", state);
  const { data, loading, error, reload } = useApiQuery<Page>(
    `oferta/grupos?${search}`,
  );
  const config = headings[activity];
  const route =
    activity === "actas"
      ? "/actas"
      : activity === "asistencia"
        ? "/docencia/asistencias"
        : "/docencia/calificaciones";
  const returnTo = `${route}${query.size ? `?${query}` : ""}`;
  const target = (id: string) =>
    activity === "asistencia"
      ? `/asistencia/grupos/${id}?retorno=${encodeURIComponent(returnTo)}`
      : `/evaluacion/grupos/${id}${activity === "actas" ? "/acta" : "/calificaciones"}`;

  return (
    <section>
      <PageHeading
        eyebrow={activity === "actas" ? "Administración" : "Espacio docente"}
        title={config.title}
        description={config.description}
      />
      <ListPanel
        filters={
          activity === "actas" ? (
            <SelectField
              label="Estado del grupo"
              value={state}
              onChange={(event) => {
                const next = new URLSearchParams();
                if (event.target.value) next.set("estado", event.target.value);
                navigate(`${route}${next.size ? `?${next}` : ""}`);
              }}
            >
              <option value="">Todos los grupos</option>
              <option value="PLANIFICADO">Planificados</option>
              <option value="ACTIVO">Activos</option>
              <option value="CERRADO">Cerrados</option>
            </SelectField>
          ) : undefined
        }
        loading={loading}
        loadingLabel="Cargando grupos…"
        error={error}
        onRetry={reload}
        empty={!data?.items.length}
        emptyDescription={
          activity === "actas"
            ? "No hay grupos para este filtro."
            : "No tienes grupos asignados disponibles."
        }
        pagination={
          <Pagination
            after={after}
            count={data?.items.length ?? 0}
            nextCursor={data?.nextCursor ?? null}
            onChange={(cursor) => {
              const next = new URLSearchParams();
              if (state) next.set("estado", state);
              if (cursor) next.set("after", cursor);
              navigate(`${route}${next.size ? `?${next}` : ""}`);
            }}
          />
        }
      >
        <DataTable
          caption={activity === "actas" ? "Grupos y actas" : "Grupos asignados"}
          rows={data?.items ?? []}
          rowKey={(row) => row.id}
          columns={[
            {
              key: "codigo",
              header: "Grupo",
              cell: (row: Row) => text(row, "codigo"),
            },
            {
              key: "periodo",
              header: "Periodo",
              cell: (row: Row) => text(row, "contexto.periodo") || "—",
            },
            {
              key: "idioma-nivel",
              header: "Idioma y nivel",
              cell: (row: Row) =>
                `${text(row, "contexto.idioma")} · ${text(row, "contexto.nivel")}`,
            },
            {
              key: "turno-seccion",
              header: "Turno y sección",
              cell: (row: Row) =>
                `${text(row, "contexto.turno")} · ${text(row, "contexto.seccion")}`,
            },
            {
              key: "estado",
              header: "Estado",
              cell: (row: Row) => (
                <StatusBadge inactive={row.estado === "CERRADO"}>
                  {text(row, "estado")}
                </StatusBadge>
              ),
            },
            {
              key: "accion",
              header: "Acción",
              cell: (row: Row) => (
                <a href={`#${target(String(row.id))}`}>
                  {activity === "asistencia"
                    ? "Ver sesiones"
                    : activity === "calificaciones"
                      ? "Abrir calificaciones"
                      : "Consultar acta"}
                </a>
              ),
            },
          ]}
        />
      </ListPanel>
    </section>
  );
}
