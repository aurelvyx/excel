import { useEffect, useState } from "react";
import { CheckCircle2, Clock, School, Users } from "lucide-react";
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
import { Pagination } from "../../shared/ui/Pagination";

export type GroupFilters = {
  periodoId: string;
  idiomaId: string;
  nivelId: string;
  after: string;
};

export function GroupChoice({
  filters,
  selectedGroup,
  onFilter,
  onSelect,
}: {
  filters: GroupFilters;
  selectedGroup?: Row | null;
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
          const map = Object.fromEntries(rows);
          setOptions(map);
          fail("");
          // Auto-select first open period if none selected
          if (!filters.periodoId && map.periodos?.length) {
            const openPeriod =
              map.periodos.find((p) => p.estado === "ABIERTO" || p.estado === "ACTIVO") ||
              map.periodos[0];
            const firstLang = map.idiomas?.find((i) => i.activo);
            const firstLevel = firstLang
              ? map.niveles?.find((n) => n.activo && String(n.idioma_id) === String(firstLang.id))
              : undefined;
            if (openPeriod) {
              onFilter({
                periodoId: String(openPeriod.id),
                idiomaId: firstLang ? String(firstLang.id) : "",
                nivelId: firstLevel ? String(firstLevel.id) : "",
                after: "",
              });
            }
          }
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

  const activeLanguages = options.idiomas.filter((row) => row.activo);
  const levelsForLanguage = options.niveles.filter(
    (row) => row.activo && String(row.idioma_id) === filters.idiomaId,
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Filtros en Tarjeta Moderna */}
      <div
        style={{
          backgroundColor: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: "0.85rem",
          padding: "1rem 1.25rem",
        }}
      >
        <div className="filters" style={{ marginBottom: activeLanguages.length > 0 ? "0.85rem" : 0 }}>
          <SelectField
            label="1. Periodo Académico"
            value={filters.periodoId}
            onChange={(e) =>
              onFilter({ ...filters, periodoId: e.target.value, after: "" })
            }
          >
            <option value="">Selecciona un periodo abierto</option>
            {options.periodos
              .filter((row) => row.estado === "ABIERTO" || row.estado === "ACTIVO")
              .map((row) => (
                <option key={row.id} value={row.id}>
                  {text(row, "nombre")} ({text(row, "codigo")})
                </option>
              ))}
          </SelectField>

          <SelectField
            label="2. Idioma / Programa"
            value={filters.idiomaId}
            onChange={(e) => {
              const newLangId = e.target.value;
              const defaultLevel = options.niveles.find(
                (n) => n.activo && String(n.idioma_id) === newLangId,
              );
              onFilter({
                ...filters,
                idiomaId: newLangId,
                nivelId: defaultLevel ? String(defaultLevel.id) : "",
                after: "",
              });
            }}
          >
            <option value="">Selecciona un idioma</option>
            {activeLanguages.map((row) => (
              <option key={row.id} value={row.id}>
                {text(row, "nombre")}
              </option>
            ))}
          </SelectField>

          <SelectField
            label="3. Nivel Académico"
            value={filters.nivelId}
            disabled={!filters.idiomaId}
            onChange={(e) =>
              onFilter({ ...filters, nivelId: e.target.value, after: "" })
            }
          >
            <option value="">Selecciona un nivel</option>
            {levelsForLanguage.map((row) => (
              <option key={row.id} value={row.id}>
                {text(row, "nombre")}
              </option>
            ))}
          </SelectField>
        </div>

        {/* Píldoras rápidas de Nivel cuando hay idioma elegido */}
        {levelsForLanguage.length > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap", paddingTop: "0.65rem", borderTop: "1px dashed #cbd5e1" }}>
            <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#64748b", marginRight: "0.25rem" }}>
              Cambio rápido de nivel:
            </span>
            {levelsForLanguage.map((lvl) => {
              const isSel = String(lvl.id) === filters.nivelId;
              return (
                <button
                  key={lvl.id}
                  type="button"
                  onClick={() => onFilter({ ...filters, nivelId: String(lvl.id), after: "" })}
                  style={{
                    padding: "0.25rem 0.65rem",
                    borderRadius: "999px",
                    fontSize: "0.73rem",
                    fontWeight: 700,
                    border: isSel ? "1px solid #007a3d" : "1px solid #cbd5e1",
                    backgroundColor: isSel ? "#007a3d" : "#ffffff",
                    color: isSel ? "#ffffff" : "#475569",
                    cursor: "pointer",
                  }}
                >
                  {text(lvl, "nombre")}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {filters.periodoId && filters.nivelId ? (
        <GroupList
          filters={filters}
          selectedGroup={selectedGroup}
          onFilter={onFilter}
          onSelect={onSelect}
        />
      ) : (
        <Feedback tone="notice">
          Selecciona periodo, idioma y nivel para consultar los salones disponibles.
        </Feedback>
      )}
    </div>
  );
}

function GroupList({
  filters,
  selectedGroup,
  onFilter,
  onSelect,
}: {
  filters: GroupFilters;
  selectedGroup?: Row | null;
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
  const items = data?.items ?? [];

  return (
    <ListPanel
      loading={loading}
      loadingLabel="Cargando salones disponibles…"
      error={error}
      onRetry={reload}
      empty={!items.length}
      emptyDescription="No hay grupos activos para este periodo y nivel."
      pagination={
        <Pagination
          after={filters.after}
          count={items.length}
          nextCursor={data?.nextCursor ?? null}
          onChange={(after) => onFilter({ ...filters, after: after ?? "" })}
        />
      }
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))",
          gap: "0.85rem",
        }}
      >
        {items.map((row) => {
          const isSelected = selectedGroup && String(selectedGroup.id) === String(row.id);
          const cap = row.capacidad == null ? "Sin límite" : `${text(row, "capacidad")} alumnos`;
          return (
            <div
              key={row.id}
              onClick={() => onSelect(row)}
              style={{
                padding: "1.1rem 1.25rem",
                borderRadius: "0.85rem",
                border: isSelected ? "2px solid #007a3d" : "1px solid #cbd5e1",
                backgroundColor: isSelected ? "#f0fdf4" : "#ffffff",
                boxShadow: isSelected
                  ? "0 6px 16px rgba(0, 122, 61, 0.14)"
                  : "0 1px 3px rgba(15, 23, 42, 0.04)",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: "0.65rem",
                transition: "all 0.15s ease",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span
                  style={{
                    fontFamily: "monospace",
                    fontSize: "0.78rem",
                    fontWeight: 800,
                    backgroundColor: isSelected ? "#007a3d" : "#f1f5f9",
                    color: isSelected ? "#ffffff" : "#0f172a",
                    padding: "0.2rem 0.55rem",
                    borderRadius: "0.4rem",
                  }}
                >
                  {text(row, "codigo")}
                </span>
                {isSelected ? (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.25rem",
                      fontSize: "0.75rem",
                      fontWeight: 800,
                      color: "#007a3d",
                    }}
                  >
                    <CheckCircle2 size={15} /> Seleccionado
                  </span>
                ) : (
                  <span style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 600 }}>
                    Clic para elegir
                  </span>
                )}
              </div>

              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <School size={15} color="#007a3d" />
                  <strong style={{ fontSize: "0.95rem", color: "#0f172a" }}>
                    {text(row, "contexto.nivel")}
                  </strong>
                </div>
                <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                  Periodo: {text(row, "contexto.periodo")}
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingTop: "0.55rem",
                  borderTop: "1px dashed #e2e8f0",
                  fontSize: "0.75rem",
                  color: "#334155",
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", fontWeight: 600 }}>
                  <Clock size={13} color="#0284c7" />
                  {text(row, "contexto.turno")} · Sec. {text(row, "contexto.seccion")}
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", color: "#64748b" }}>
                  <Users size={13} /> {cap}
                </span>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(row);
                }}
                className={`academic-btn-action ${isSelected ? "btn-action-primary" : "btn-action-secondary"}`}
                style={{ width: "100%", justifyContent: "center", marginTop: "0.2rem" }}
              >
                {isSelected ? "✓ Salón Elegido" : "Seleccionar este Salón"}
              </button>
            </div>
          );
        })}
      </div>
    </ListPanel>
  );
}
