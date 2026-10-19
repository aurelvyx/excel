import { useEffect, useState } from "react";
import {
  allRows,
  errorText,
  text,
  type Page,
  type Row,
} from "../../shared/api";
import { useApiQuery } from "../../shared/useApiQuery";
import { SelectField } from "../../shared/ui/Field";
import { Feedback, Loading } from "../../shared/ui/Feedback";
import { ListPanel } from "../../shared/ui/ListPanel";
import { DataTable } from "../../shared/ui/DataTable";
import { Pagination } from "../../shared/ui/Pagination";
import { Button } from "../../shared/ui/Button";
export type GroupFilters = {
  periodoId: string;
  idiomaId: string;
  nivelId: string;
  after: string;
};
export function GroupChoice({
  filters,
  onFilter,
  onSelect,
}: {
  filters: GroupFilters;
  onFilter: (value: GroupFilters) => void;
  onSelect: (row: Row) => void;
}) {
  const [options, setOptions] = useState<Record<string, Row[]> | null>(null);
  const [error, fail] = useState("");
  const [version, retry] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    void Promise.all(
      ["periodos", "idiomas", "niveles"].map(
        async (key) =>
          [key, await allRows(`oferta/${key}`, abort.signal)] as const,
      ),
    )
      .then((rows) => {
        if (!abort.signal.aborted) {
          setOptions(Object.fromEntries(rows));
          fail("");
        }
      })
      .catch((e) => {
        if (!abort.signal.aborted) fail(errorText(e));
      });
    return () => abort.abort();
  }, [version]);
  if (error)
    return <Feedback onRetry={() => retry((v) => v + 1)}>{error}</Feedback>;
  if (!options) return <Loading>Cargando oferta académica…</Loading>;
  return (
    <>
      <div className="filters">
        <SelectField
          label="Periodo"
          value={filters.periodoId}
          onChange={(e) =>
            onFilter({ ...filters, periodoId: e.target.value, after: "" })
          }
        >
          <option value="">Selecciona un periodo abierto</option>
          {options.periodos
            .filter((row) => row.estado === "ABIERTO")
            .map((row) => (
              <option key={row.id} value={row.id}>
                {text(row, "nombre")}
              </option>
            ))}
        </SelectField>
        <SelectField
          label="Idioma"
          value={filters.idiomaId}
          onChange={(e) =>
            onFilter({
              ...filters,
              idiomaId: e.target.value,
              nivelId: "",
              after: "",
            })
          }
        >
          <option value="">Selecciona un idioma</option>
          {options.idiomas
            .filter((row) => row.activo)
            .map((row) => (
              <option key={row.id} value={row.id}>
                {text(row, "nombre")}
              </option>
            ))}
        </SelectField>
        <SelectField
          label="Nivel"
          value={filters.nivelId}
          disabled={!filters.idiomaId}
          onChange={(e) =>
            onFilter({ ...filters, nivelId: e.target.value, after: "" })
          }
        >
          <option value="">Selecciona un nivel</option>
          {options.niveles
            .filter(
              (row) => row.activo && String(row.idioma_id) === filters.idiomaId,
            )
            .map((row) => (
              <option key={row.id} value={row.id}>
                {text(row, "nombre")}
              </option>
            ))}
        </SelectField>
      </div>
      {filters.periodoId && filters.nivelId ? (
        <GroupList filters={filters} onFilter={onFilter} onSelect={onSelect} />
      ) : (
        <Feedback tone="notice">
          Selecciona periodo, idioma y nivel para consultar sus grupos.
        </Feedback>
      )}
    </>
  );
}
function GroupList({
  filters,
  onFilter,
  onSelect,
}: {
  filters: GroupFilters;
  onFilter: (value: GroupFilters) => void;
  onSelect: (row: Row) => void;
}) {
  const params = new URLSearchParams({
    periodoId: filters.periodoId,
    nivelId: filters.nivelId,
    estado: "ACTIVO",
    limit: "20",
  });
  if (filters.after) params.set("after", filters.after);
  const { data, loading, error, reload } = useApiQuery<Page>(
    `oferta/grupos?${params}`,
  );
  return (
    <ListPanel
      loading={loading}
      loadingLabel="Cargando grupos…"
      error={error}
      onRetry={reload}
      empty={!data?.items.length}
      emptyDescription="No hay grupos activos para este periodo y nivel."
      pagination={
        <Pagination
          after={filters.after}
          count={data?.items.length ?? 0}
          nextCursor={data?.nextCursor ?? null}
          onChange={(after) => onFilter({ ...filters, after: after ?? "" })}
        />
      }
    >
      <DataTable
        caption="Grupos para matrícula"
        rows={data?.items ?? []}
        rowKey={(row) => row.id}
        columns={[
          { key: "grupo", header: "Grupo", cell: (row) => text(row, "codigo") },
          {
            key: "nivel",
            header: "Idioma y nivel",
            cell: (row) => text(row, "contexto.nivel"),
          },
          {
            key: "periodo",
            header: "Periodo",
            cell: (row) => text(row, "contexto.periodo"),
          },
          {
            key: "turno",
            header: "Turno y sección",
            cell: (row) =>
              `${text(row, "contexto.turno")} · ${text(row, "contexto.seccion")}`,
          },
          {
            key: "capacidad",
            header: "Capacidad",
            cell: (row) =>
              row.capacidad == null
                ? "Sin límite configurado"
                : text(row, "capacidad"),
          },
          {
            key: "accion",
            header: "Acciones",
            cell: (row) => (
              <Button variant="link" onClick={() => onSelect(row)}>
                Seleccionar grupo
              </Button>
            ),
          },
        ]}
      />
    </ListPanel>
  );
}
