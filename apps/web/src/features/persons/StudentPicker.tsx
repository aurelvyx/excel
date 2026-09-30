import { useState, type FormEvent } from "react";
import { Dialog } from "../../shared/Dialog";
import { useApiQuery } from "../../shared/useApiQuery";
import { text, type Page, type Row } from "../../shared/api";
import { InputField } from "../../shared/ui/Field";
import { Button } from "../../shared/ui/Button";
import { ListPanel } from "../../shared/ui/ListPanel";
import { DataTable } from "../../shared/ui/DataTable";
import { Pagination } from "../../shared/ui/Pagination";
export function StudentPicker({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (row: Row) => void;
}) {
  const [query, setQuery] = useState("");
  const [after, setAfter] = useState("");
  const params = new URLSearchParams({ activo: "true", limit: "20" });
  if (query) params.set("q", query);
  if (after) params.set("after", after);
  const { data, loading, error, reload } = useApiQuery<Page>(
    `estudiantes?${params}`,
  );
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(String(new FormData(event.currentTarget).get("q") ?? "").trim());
    setAfter("");
  }
  return (
    <Dialog title="Seleccionar estudiante" onClose={onClose}>
      <p>
        Busca por documento, código o nombre. Solo se muestran estudiantes
        activos.
      </p>
      <ListPanel
        loading={loading}
        loadingLabel="Buscando estudiantes…"
        error={error}
        onRetry={reload}
        empty={!data?.items.length}
        emptyDescription="No hay estudiantes activos para esta búsqueda."
        filters={
          <form className="filters" onSubmit={search}>
            <InputField label="Buscar estudiante" name="q" maxLength={120} />
            <Button type="submit" disabled={loading}>
              Buscar
            </Button>
          </form>
        }
        pagination={
          <Pagination
            after={after}
            nextCursor={data?.nextCursor ?? null}
            count={data?.items.length ?? 0}
            onChange={setAfter}
          />
        }
      >
        <DataTable
          caption="Estudiantes disponibles"
          rows={data?.items ?? []}
          rowKey={(row) => row.id}
          columns={[
            {
              key: "persona",
              header: "Estudiante",
              cell: (row) => (
                <>
                  {text(row, "nombres")} {text(row, "apellido_paterno")}{" "}
                  {text(row, "apellido_materno")}
                  <br />
                  {text(row, "codigo_estudiante")}
                </>
              ),
            },
            {
              key: "documento",
              header: "Documento",
              cell: (row) =>
                `${text(row, "tipo_documento")} ${text(row, "numero_documento")}`,
            },
            {
              key: "accion",
              header: "Acciones",
              cell: (row) => (
                <Button variant="link" onClick={() => onSelect(row)}>
                  Seleccionar
                </Button>
              ),
            },
          ]}
        />
      </ListPanel>
    </Dialog>
  );
}
