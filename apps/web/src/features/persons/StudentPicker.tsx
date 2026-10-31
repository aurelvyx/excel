import { useState, type FormEvent } from "react";
import { Dialog } from "../../shared/Dialog";
import { useApiQuery } from "../../shared/useApiQuery";
import { text, type Page, type Row } from "../../shared/api";
import { InputField } from "../../shared/ui/Field";
import { Button } from "../../shared/ui/Button";
import { ListPanel } from "../../shared/ui/ListPanel";
import { DataTable } from "../../shared/ui/DataTable";
import { Pagination } from "../../shared/ui/Pagination";
import { Feedback } from "../../shared/ui/Feedback";
import "../academic/academic.css";

export function StudentPicker({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (row: Row) => void;
}) {
  return (
    <Dialog title="Seleccionar estudiante" onClose={onClose}>
      <StudentSearch onSelect={onSelect} />
    </Dialog>
  );
}

export function StudentSearch({ onSelect }: { onSelect: (row: Row) => void }) {
  const [query, setQuery] = useState("");
  const [after, setAfter] = useState("");
  const params = new URLSearchParams({ activo: "true", limit: "10" });
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

  function clearSearch() {
    setQuery("");
    setAfter("");
  }

  const items = data?.items ?? [];

  return (
    <div className="student-picker-wrapper">
      <div className="student-db-alert">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
        <div>
          <strong>Consulta de Estudiantes en Base de Datos</strong>
          <span>Busca por DNI, código o apellidos. Si el estudiante ya existe en la base de datos, sus datos se reutilizan automáticamente para evitar registros duplicados.</span>
        </div>
      </div>

      <ListPanel
        loading={false}
        loadingLabel="Buscando estudiantes en BD…"
        error=""
        onRetry={reload}
        empty={!loading && !error && !items.length}
        emptyDescription={
          query
            ? `No se encontraron estudiantes registrados con el término "${query}".`
            : "No hay estudiantes activos disponibles."
        }
        filters={
          <form className="filters" onSubmit={search}>
            <InputField
              label="Buscar por DNI, código o nombre"
              name="q"
              maxLength={120}
              defaultValue={query}
              placeholder="Ej. 72345678, DEMO, Juan..."
            />
            <Button type="submit" variant="primary" disabled={loading}>
              Buscar en BD
            </Button>
            {query && (
              <Button type="button" onClick={clearSearch} disabled={loading}>
                Limpiar
              </Button>
            )}
          </form>
        }
        pagination={null}
      >
        <div className="student-results" aria-busy={loading}>
          {loading && (
            <p className="student-results-status" role="status">
              Consultando base de datos…
            </p>
          )}
          {error && <Feedback onRetry={reload}>{error}</Feedback>}

          {items.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem", padding: "0.5rem 0.75rem", background: "#f8fafc", borderRadius: "0.5rem", border: "1px solid #e2e8f0", fontSize: "0.813rem", color: "#475569" }}>
              <span>✓ <strong>{items.length}</strong> estudiante{items.length === 1 ? "" : "s"} encontrado{items.length === 1 ? "" : "s"} con datos registrados en la BD:</span>
              <span style={{ color: "#007a3d", fontWeight: 600 }}>Selecciona para matricular</span>
            </div>
          )}

          <DataTable
            caption="Estudiantes registrados en el sistema"
            rows={items}
            rowKey={(row) => row.id}
            columns={[
              {
                key: "persona",
                header: "Estudiante",
                cell: (row) => {
                  const names = `${text(row, "nombres")} ${text(row, "apellido_paterno")} ${text(row, "apellido_materno")}`;
                  const initials = (text(row, "nombres")[0] || "") + (text(row, "apellido_paterno")[0] || "");
                  return (
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <div className="student-search-avatar" style={{ flexShrink: 0 }}>
                        {initials.toUpperCase() || "E"}
                      </div>
                      <div>
                        <strong style={{ display: "block", color: "#0f172a", fontSize: "0.875rem" }}>
                          {names}
                        </strong>
                        <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                          Cód: {text(row, "codigo_estudiante")}
                        </span>
                      </div>
                    </div>
                  );
                },
              },
              {
                key: "documento",
                header: "Documento de Identidad",
                cell: (row) => (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                    <span style={{ fontWeight: 600, color: "#1e293b", fontSize: "0.875rem" }}>
                      {text(row, "tipo_documento")}: {text(row, "numero_documento")}
                    </span>
                    <span className="badge-verified" style={{ width: "fit-content", fontSize: "0.688rem", padding: "0.15rem 0.5rem" }}>
                      ✓ Registrado en BD
                    </span>
                  </div>
                ),
              },
              {
                key: "accion",
                header: "Acción",
                cell: (row) => (
                  <Button
                    variant="primary"
                    onClick={() => onSelect(row)}
                    style={{ whiteSpace: "nowrap", fontSize: "0.813rem", padding: "0.4rem 0.75rem" }}
                  >
                    Seleccionar estudiante
                  </Button>
                ),
              },
            ]}
          />
          <Pagination
            after={after}
            nextCursor={data?.nextCursor ?? null}
            count={items.length}
            disabled={loading}
            onChange={(cursor) => {
              if (!loading) setAfter(cursor);
            }}
          />
        </div>
      </ListPanel>
    </div>
  );
}

