import { useMemo, useState } from "react";
import {
  Users,
  Calendar,
  Search,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  School,
  ArrowRight,
  Sparkles,
  Filter,
  X,
} from "lucide-react";
import { Feedback, Loading } from "../../shared/ui/Feedback";
import { useApiQuery } from "../../shared/useApiQuery";
import { text, type Page, type Row } from "../../shared/api";
import { navigate } from "../../shared/navigation";
import "../academic/academic.css";

const periodOrder: Record<string, number> = {
  ABIERTO: 0,
  ACTIVO: 0,
  PLANIFICADO: 1,
  CERRADO: 2,
};
const periodLabels: Record<string, string> = {
  ABIERTO: "Abierto",
  ACTIVO: "Activo",
  PLANIFICADO: "Planificado",
  CERRADO: "Cerrado",
};

type GroupCategoryFilter = "ALL" | "AVAILABLE" | "FULL" | "PENDING_VOUCHER";

/**
 * Punto de entrada de Matrículas: se elige un periodo, se clasifican sus salones
 * por idioma o estado de cupos/vouchers, y se ingresa a la nómina o al asistente.
 */
export function EnrollmentsHome({
  query,
  canEnroll,
}: {
  query: URLSearchParams;
  canEnroll: boolean;
}) {
  const periods = useApiQuery<Page>("oferta/periodos?limit=100");
  const [search, setSearch] = useState("");
  const [groupSearch, setGroupSearch] = useState("");
  const [languageFilter, setLanguageFilter] = useState<string>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<GroupCategoryFilter>("ALL");

  const sorted = useMemo(
    () =>
      [...(periods.data?.items ?? [])].sort(
        (a, b) =>
          (periodOrder[text(a, "estado")] ?? 9) -
            (periodOrder[text(b, "estado")] ?? 9) ||
          text(b, "fecha_inicio").localeCompare(text(a, "fecha_inicio")),
      ),
    [periods.data],
  );

  const visible = sorted.filter((row) =>
    `${text(row, "codigo")} ${text(row, "nombre")}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );

  const selected = query.get("periodo") ?? String(sorted[0]?.id ?? "");
  const groups = useApiQuery<Page>(
    selected
      ? `matriculas/grupos?periodoId=${encodeURIComponent(selected)}&limit=100`
      : "matriculas/grupos?periodoId=0&limit=1",
  );
  const period = sorted.find((row) => String(row.id) === selected);
  const groupItems = groups.data?.items ?? [];

  // Métricas agregadas del periodo
  const metrics = useMemo(() => {
    let enrolled = 0;
    let pending = 0;
    let totalCapacity = 0;
    let availableGroups = 0;
    let fullGroups = 0;
    let groupsWithPending = 0;

    for (const g of groupItems) {
      const m = Number(g.matriculados) || 0;
      const p = Number(g.pendientes) || 0;
      const c = Number(g.capacidad) || 0;
      enrolled += m;
      pending += p;
      totalCapacity += c;
      if (c > 0 && m >= c) fullGroups++;
      else availableGroups++;
      if (p > 0) groupsWithPending++;
    }

    return {
      enrolled,
      pending,
      validated: Math.max(0, enrolled - pending),
      totalCapacity,
      availableGroups,
      fullGroups,
      groupsWithPending,
    };
  }, [groupItems]);

  // Idiomas únicos en el periodo
  const availableLanguages = useMemo(() => {
    const map = new Map<string, number>();
    for (const g of groupItems) {
      const idm = text(g, "idioma") || "General";
      map.set(idm, (map.get(idm) ?? 0) + 1);
    }
    return Array.from(map.entries());
  }, [groupItems]);

  // Filtrado combinado de salones
  const filteredGroups = useMemo(() => {
    return groupItems.filter((group) => {
      const idm = text(group, "idioma") || "General";
      if (languageFilter !== "ALL" && idm !== languageFilter) return false;

      const enrolled = Number(group.matriculados) || 0;
      const pending = Number(group.pendientes) || 0;
      const capacity = Number(group.capacidad) || 0;
      const isFull = capacity > 0 && enrolled >= capacity;

      if (categoryFilter === "AVAILABLE" && isFull) return false;
      if (categoryFilter === "FULL" && !isFull) return false;
      if (categoryFilter === "PENDING_VOUCHER" && pending === 0) return false;

      if (!groupSearch.trim()) return true;
      const term = groupSearch.toLowerCase().trim();
      return (
        text(group, "codigo").toLowerCase().includes(term) ||
        text(group, "idioma").toLowerCase().includes(term) ||
        text(group, "nivel").toLowerCase().includes(term) ||
        text(group, "turno").toLowerCase().includes(term) ||
        text(group, "seccion").toLowerCase().includes(term)
      );
    });
  }, [groupItems, languageFilter, categoryFilter, groupSearch]);

  return (
    <div className="academic-container">
      {/* Encabezado Ejecutivo de Matrículas */}
      <div
        className="academic-card"
        style={{
          padding: "1.5rem 1.75rem",
          background: "linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)",
          borderLeft: "5px solid #007a3d",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: "1rem",
          }}
        >
          <div style={{ maxWidth: "660px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
              <span className="academic-badge badge-green">
                <Sparkles size={11} style={{ marginRight: "0.25rem" }} />
                ADMISIÓN Y REGISTRO ACADÉMICO
              </span>
              {period && (
                <span className="academic-badge badge-blue">
                  Ciclo: {text(period, "codigo")}
                </span>
              )}
            </div>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#0f172a", margin: "0 0 0.3rem 0" }}>
              Gestión de Matrículas y Nóminas por Salón
            </h1>
            <p style={{ fontSize: "0.84rem", color: "#475569", margin: 0, lineHeight: 1.5 }}>
              Selecciona un periodo académico, clasifica los salones por idioma, disponibilidad de vacantes o vouchers pendientes, y administra la nómina oficial de alumnos.
            </p>
          </div>

          <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
            <a
              href="#/vouchers"
              className="academic-btn-action btn-action-secondary"
              style={{ backgroundColor: "#ffffff", padding: "0.55rem 0.95rem" }}
            >
              🧾 Revisar Vouchers ({metrics.pending})
            </a>
            {canEnroll && (
              <a
                href="#/matriculas/nueva"
                className="academic-btn-action btn-action-primary"
                style={{ padding: "0.55rem 1.15rem", fontSize: "0.84rem" }}
              >
                <Plus size={16} /> Matricular Estudiante
              </a>
            )}
          </div>
        </div>
      </div>

      {!canEnroll && (
        <p className="readonly">
          Solo lectura · Consulta autorizada para tu rol
        </p>
      )}

      {/* 4 Tarjetas KPI Interactivas del Periodo Seleccionado */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: "0.85rem",
        }}
      >
        <div
          onClick={() => setCategoryFilter("ALL")}
          className="academic-card"
          style={{
            padding: "1rem 1.15rem",
            display: "flex",
            alignItems: "center",
            gap: "0.85rem",
            cursor: "pointer",
            border: categoryFilter === "ALL" ? "2px solid #007a3d" : undefined,
          }}
        >
          <div
            style={{
              width: "2.75rem",
              height: "2.75rem",
              borderRadius: "0.75rem",
              backgroundColor: "#f0fdf4",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <School size={20} color="#007a3d" />
          </div>
          <div>
            <span style={{ fontSize: "0.6875rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
              Salones del Periodo
            </span>
            <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "#0f172a", lineHeight: 1.2 }}>
              {groups.loading ? "…" : groupItems.length}
            </div>
            <span style={{ fontSize: "0.72rem", color: "#007a3d", fontWeight: 600 }}>
              {period ? text(period, "nombre") : "Selecciona un ciclo"}
            </span>
          </div>
        </div>

        <div
          onClick={() => setCategoryFilter("AVAILABLE")}
          className="academic-card"
          style={{
            padding: "1rem 1.15rem",
            display: "flex",
            alignItems: "center",
            gap: "0.85rem",
            cursor: "pointer",
            border: categoryFilter === "AVAILABLE" ? "2px solid #2563eb" : undefined,
          }}
        >
          <div
            style={{
              width: "2.75rem",
              height: "2.75rem",
              borderRadius: "0.75rem",
              backgroundColor: "#eff6ff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Users size={20} color="#2563eb" />
          </div>
          <div>
            <span style={{ fontSize: "0.6875rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
              Total Matrículas
            </span>
            <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "#0f172a", lineHeight: 1.2 }}>
              {groups.loading ? "…" : metrics.enrolled}
            </div>
            <span style={{ fontSize: "0.72rem", color: "#2563eb", fontWeight: 600 }}>
              {metrics.availableGroups} salones con vacantes
            </span>
          </div>
        </div>

        <div
          className="academic-card"
          style={{
            padding: "1rem 1.15rem",
            display: "flex",
            alignItems: "center",
            gap: "0.85rem",
          }}
        >
          <div
            style={{
              width: "2.75rem",
              height: "2.75rem",
              borderRadius: "0.75rem",
              backgroundColor: "#ecfdf5",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <CheckCircle2 size={20} color="#059669" />
          </div>
          <div>
            <span style={{ fontSize: "0.6875rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
              Matrículas Activas
            </span>
            <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "#059669", lineHeight: 1.2 }}>
              {groups.loading ? "…" : metrics.validated}
            </div>
            <span style={{ fontSize: "0.72rem", color: "#065f46", fontWeight: 600 }}>
              Con pago validado
            </span>
          </div>
        </div>

        <div
          onClick={() => setCategoryFilter(categoryFilter === "PENDING_VOUCHER" ? "ALL" : "PENDING_VOUCHER")}
          className="academic-card"
          style={{
            padding: "1rem 1.15rem",
            display: "flex",
            alignItems: "center",
            gap: "0.85rem",
            cursor: "pointer",
            border: categoryFilter === "PENDING_VOUCHER" ? "2px solid #d97706" : undefined,
          }}
        >
          <div
            style={{
              width: "2.75rem",
              height: "2.75rem",
              borderRadius: "0.75rem",
              backgroundColor: "#fffbeb",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <AlertCircle size={20} color="#d97706" />
          </div>
          <div>
            <span style={{ fontSize: "0.6875rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
              Pendientes de Voucher
            </span>
            <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "#d97706", lineHeight: 1.2 }}>
              {groups.loading ? "…" : metrics.pending}
            </div>
            <span style={{ fontSize: "0.72rem", color: "#b45309", fontWeight: 600 }}>
              En {metrics.groupsWithPending} {metrics.groupsWithPending === 1 ? "salón" : "salones"} (clic para filtrar)
            </span>
          </div>
        </div>
      </div>

      {/* Layout Principal: Barra Lateral de Periodos + Panel Clasificado de Salones */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "290px minmax(0, 1fr)",
          gap: "1.25rem",
          alignItems: "start",
        }}
      >
        {/* Columna Izquierda: Selector de Periodos Académicos */}
        <aside className="academic-card" style={{ padding: "1.25rem" }} aria-label="Periodos académicos">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
            <div>
              <span style={{ fontSize: "0.68rem", fontWeight: 800, color: "#007a3d", textTransform: "uppercase" }}>
                Ciclos Disponibles
              </span>
              <h2 style={{ fontSize: "1rem", fontWeight: 800, color: "#1e293b", margin: "0.1rem 0 0 0" }}>
                Periodos Académicos
              </h2>
            </div>
            <span className="academic-badge badge-green">
              {periods.loading ? "…" : visible.length}
            </span>
          </div>

          <div className="academic-search-input-wrapper" style={{ marginBottom: "0.85rem" }}>
            <Search size={14} color="#94a3b8" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar código o nombre…"
              className="academic-search-input"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}
              >
                <X size={13} color="#94a3b8" />
              </button>
            )}
          </div>

          {periods.loading ? (
            <Loading>Cargando periodos…</Loading>
          ) : periods.error ? (
            <Feedback onRetry={periods.reload}>{periods.error}</Feedback>
          ) : visible.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {visible.map((row) => {
                const key = String(row.id);
                const isSel = key === selected;
                const est = text(row, "estado");
                const isOpen = est === "ABIERTO" || est === "ACTIVO";

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setLanguageFilter("ALL");
                      setCategoryFilter("ALL");
                      navigate(`/matriculas?periodo=${key}`);
                    }}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "0.5rem",
                      width: "100%",
                      padding: "0.75rem 0.85rem",
                      borderRadius: "0.75rem",
                      border: isSel ? "2px solid #007a3d" : "1px solid #e2e8f0",
                      backgroundColor: isSel ? "#f0fdf4" : "#ffffff",
                      textAlign: "left",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <strong
                        style={{
                          display: "block",
                          fontSize: "0.84rem",
                          color: isSel ? "#064e3b" : "#1e293b",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {text(row, "nombre")}
                      </strong>
                      <small style={{ fontSize: "0.72rem", color: "#64748b", fontFamily: "monospace" }}>
                        {text(row, "codigo")}
                      </small>
                    </div>
                    <span className={`academic-badge ${isOpen ? "badge-green" : "badge-gray"}`}>
                      {periodLabels[est] ?? est}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p style={{ fontSize: "0.8125rem", color: "#94a3b8", textAlign: "center", padding: "1rem 0" }}>
              No hay periodos con ese criterio.
            </p>
          )}
        </aside>

        {/* Columna Derecha: Salones Clasificados del Periodo */}
        <section className="academic-card" style={{ padding: "1.35rem 1.5rem" }} aria-label="Grupos del periodo">
          {/* Cabecera del panel de salones */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "0.75rem",
              marginBottom: "1rem",
            }}
          >
            <div>
              <span style={{ fontSize: "0.68rem", fontWeight: 800, color: "#007a3d", textTransform: "uppercase" }}>
                Nóminas y Cupos por Salón
              </span>
              <h2 style={{ fontSize: "1.15rem", fontWeight: 800, color: "#0f172a", margin: "0.1rem 0 0 0" }}>
                {period ? text(period, "nombre") : "Grupos del periodo elegido"}
              </h2>
            </div>

            {/* Filtro por Idioma */}
            {availableLanguages.length > 1 && (
              <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => setLanguageFilter("ALL")}
                  style={{
                    padding: "0.3rem 0.7rem",
                    borderRadius: "999px",
                    fontSize: "0.74rem",
                    fontWeight: 700,
                    border: languageFilter === "ALL" ? "1px solid #007a3d" : "1px solid #e2e8f0",
                    backgroundColor: languageFilter === "ALL" ? "#007a3d" : "#f8fafc",
                    color: languageFilter === "ALL" ? "#ffffff" : "#475569",
                    cursor: "pointer",
                  }}
                >
                  Todos los idiomas ({groupItems.length})
                </button>
                {availableLanguages.map(([lang, count]) => {
                  const active = languageFilter === lang;
                  return (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => setLanguageFilter(lang)}
                      style={{
                        padding: "0.3rem 0.7rem",
                        borderRadius: "999px",
                        fontSize: "0.74rem",
                        fontWeight: 700,
                        border: active ? "1px solid #007a3d" : "1px solid #e2e8f0",
                        backgroundColor: active ? "#007a3d" : "#f8fafc",
                        color: active ? "#ffffff" : "#475569",
                        cursor: "pointer",
                      }}
                    >
                      {lang} ({count})
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Barra de Herramientas: Búsqueda + Clasificación Rápida por Estado */}
          {groupItems.length > 0 && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "0.75rem",
                padding: "0.75rem",
                backgroundColor: "#f8fafc",
                borderRadius: "0.75rem",
                border: "1px solid #e2e8f0",
                marginBottom: "1rem",
              }}
            >
              <div className="academic-search-input-wrapper" style={{ flex: 1, minWidth: "240px", backgroundColor: "#ffffff" }}>
                <Search size={15} color="#94a3b8" />
                <input
                  type="text"
                  value={groupSearch}
                  onChange={(e) => setGroupSearch(e.target.value)}
                  placeholder="Buscar salón por código, idioma, nivel o turno…"
                  className="academic-search-input"
                />
                {groupSearch && (
                  <button
                    type="button"
                    onClick={() => setGroupSearch("")}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}
                  >
                    <X size={14} color="#94a3b8" />
                  </button>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexWrap: "wrap" }}>
                <Filter size={13} color="#64748b" style={{ marginRight: "0.15rem" }} />
                {[
                  { id: "ALL" as const, label: `Todos (${groupItems.length})` },
                  { id: "AVAILABLE" as const, label: `Con vacantes (${metrics.availableGroups})` },
                  { id: "FULL" as const, label: `Cupo lleno (${metrics.fullGroups})` },
                  { id: "PENDING_VOUCHER" as const, label: `Con vouchers pendientes (${metrics.groupsWithPending})` },
                ].map((tab) => {
                  const active = categoryFilter === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setCategoryFilter(tab.id)}
                      style={{
                        padding: "0.32rem 0.65rem",
                        borderRadius: "0.5rem",
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        border: active ? "1px solid #0f172a" : "1px solid #cbd5e1",
                        backgroundColor: active ? "#0f172a" : "#ffffff",
                        color: active ? "#ffffff" : "#475569",
                        cursor: "pointer",
                      }}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Lista de Tarjetas de Salón */}
          {!selected ? (
            <p className="muted">Todavía no hay periodos registrados.</p>
          ) : groups.loading ? (
            <Loading>Cargando salones del periodo…</Loading>
          ) : groups.error ? (
            <Feedback onRetry={groups.reload}>{groups.error}</Feedback>
          ) : !groupItems.length ? (
            <div style={{ textAlign: "center", padding: "3rem 1rem", color: "#64748b" }}>
              <Calendar size={32} color="#cbd5e1" style={{ margin: "0 auto 0.5rem" }} />
              <p style={{ margin: 0, fontWeight: 600 }}>Este periodo todavía no tiene salones aperturados.</p>
            </div>
          ) : !filteredGroups.length ? (
            <div style={{ textAlign: "center", padding: "2.5rem 1rem", color: "#64748b" }}>
              <p style={{ margin: "0 0 0.75rem" }}>
                Ningún salón coincide con los filtros actuales.
              </p>
              <button
                type="button"
                onClick={() => {
                  setGroupSearch("");
                  setLanguageFilter("ALL");
                  setCategoryFilter("ALL");
                }}
                className="academic-btn-action btn-action-secondary"
              >
                Restablecer filtros
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {filteredGroups.map((group) => (
                <GroupRow
                  key={group.id}
                  group={group}
                  periodId={selected}
                  canEnroll={canEnroll}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function GroupRow({
  group,
  periodId,
  canEnroll,
}: {
  group: Row;
  periodId: string;
  canEnroll: boolean;
}) {
  const capacity = text(group, "capacidad");
  const enrolled = Number(group.matriculados) || 0;
  const pending = Number(group.pendientes ?? 0);
  const validated = Math.max(0, enrolled - pending);
  const capacityNumber = Number(capacity);
  const fill =
    capacityNumber > 0
      ? Math.min(100, Math.round((enrolled / capacityNumber) * 100))
      : null;
  const isFull = capacityNumber > 0 && enrolled >= capacityNumber;

  const section = text(group, "seccion");
  const sectionLabel = /^secci[oó]n/i.test(section)
    ? section
    : `Sección ${section}`;
  const schedule = text(group, "hora_inicio")
    ? `${text(group, "hora_inicio").slice(0, 5)}–${text(group, "hora_fin").slice(0, 5)}`
    : "";
  const idioma = text(group, "idioma");
  const isEnglish = idioma.toLowerCase().startsWith("i");
  const isPortuguese = idioma.toLowerCase().startsWith("p");

  const theme = isEnglish
    ? { bg: "#ecfdf5", color: "#065f46", border: "#a7f3d0", accent: "#007a3d" }
    : isPortuguese
      ? { bg: "#fef3c7", color: "#92400e", border: "#fde68a", accent: "#d97706" }
      : { bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe", accent: "#2563eb" };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "1rem",
        padding: "1rem 1.25rem",
        borderRadius: "0.85rem",
        backgroundColor: "#ffffff",
        border: "1px solid #e2e8f0",
        borderLeft: `4px solid ${theme.accent}`,
        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.03)",
        transition: "box-shadow 0.15s ease",
      }}
    >
      {/* Información del Salón */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "0.85rem", flex: "1 1 300px" }}>
        <div
          style={{
            width: "2.65rem",
            height: "2.65rem",
            borderRadius: "0.7rem",
            backgroundColor: theme.bg,
            border: `1px solid ${theme.border}`,
            color: theme.color,
            fontWeight: 800,
            fontSize: "1rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {idioma.slice(0, 2).toUpperCase() || "GR"}
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
            <strong style={{ fontSize: "0.95rem", color: "#0f172a" }}>
              {idioma} — {text(group, "nivel")}
            </strong>
            <span
              style={{
                fontFamily: "monospace",
                fontSize: "0.72rem",
                fontWeight: 700,
                backgroundColor: "#f1f5f9",
                color: "#334155",
                padding: "0.12rem 0.45rem",
                borderRadius: "0.35rem",
              }}
            >
              {text(group, "codigo")}
            </span>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              flexWrap: "wrap",
              marginTop: "0.45rem",
              fontSize: "0.75rem",
              color: "#475569",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.25rem",
                backgroundColor: "#f8fafc",
                border: "1px solid #e2e8f0",
                padding: "0.15rem 0.5rem",
                borderRadius: "999px",
              }}
            >
              <Clock size={12} color="#64748b" />
              {text(group, "turno")} {schedule && `(${schedule})`}
            </span>
            <span
              style={{
                backgroundColor: "#f8fafc",
                border: "1px solid #e2e8f0",
                padding: "0.15rem 0.5rem",
                borderRadius: "999px",
              }}
            >
              {sectionLabel}
            </span>
            {capacityNumber > 0 && (
              <span
                style={{
                  fontWeight: 700,
                  padding: "0.15rem 0.55rem",
                  borderRadius: "999px",
                  backgroundColor: isFull ? "#fef2f2" : "#f0fdf4",
                  color: isFull ? "#b91c1c" : "#15803d",
                  border: `1px solid ${isFull ? "#fecaca" : "#bbf7d0"}`,
                }}
              >
                {isFull
                  ? enrolled > capacityNumber
                    ? `Sobrecupo (${enrolled}/${capacityNumber})`
                    : "Cupo completo"
                  : `${capacityNumber - enrolled} vacantes libres`}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Barra de Ocupación y Desglose de Vouchers */}
      <div style={{ minWidth: "190px", flex: "0 1 220px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.3rem" }}>
          <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>Ocupación:</span>
          <strong style={{ fontSize: "0.875rem", color: "#0f172a" }}>
            {enrolled}
            {capacityNumber > 0 ? <span style={{ color: "#64748b", fontWeight: 500 }}> / {capacityNumber}</span> : null}{" "}
            <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "#64748b" }}>alumnos</span>
          </strong>
        </div>

        {fill !== null && (
          <div
            style={{
              height: "0.45rem",
              borderRadius: "999px",
              backgroundColor: "#e2e8f0",
              overflow: "hidden",
              marginBottom: "0.35rem",
            }}
          >
            <div
              style={{
                width: `${fill}%`,
                height: "100%",
                backgroundColor: isFull ? "#059669" : "#007a3d",
                borderRadius: "999px",
              }}
            />
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", fontWeight: 600 }}>
          <span style={{ color: "#059669" }}>✓ {validated} activas</span>
          {pending > 0 ? (
            <span style={{ color: "#d97706" }}>⏳ {pending} pend. voucher</span>
          ) : (
            <span style={{ color: "#94a3b8" }}>0 pendientes</span>
          )}
        </div>
      </div>

      {/* Acciones del Salón */}
      <div style={{ display: "flex", gap: "0.45rem", alignItems: "center", flexWrap: "wrap" }}>
        {canEnroll && (
          <a
            href={`#/matriculas/nueva?grupoId=${group.id}`}
            className="academic-btn-action btn-action-secondary"
            style={{
              borderColor: "#bbf7d0",
              backgroundColor: "#f0fdf4",
              color: "#007a3d",
              fontSize: "0.75rem",
              padding: "0.45rem 0.75rem",
            }}
            title="Matricular un estudiante directamente en este salón"
          >
            <Plus size={13} /> Matricular aquí
          </a>
        )}
        <a
          href={`#/matriculas/grupo/${group.id}?periodo=${periodId}`}
          className="academic-btn-action btn-action-primary"
          style={{ fontSize: "0.78rem", padding: "0.45rem 0.9rem" }}
        >
          <span>Ver Nómina</span>
          <ArrowRight size={13} />
        </a>
        <a
          href={`#/salones/${group.id}`}
          className="academic-btn-action btn-action-secondary"
          title="Abrir Espacio del Salón 360°"
          style={{ fontSize: "0.75rem", padding: "0.45rem 0.65rem" }}
        >
          🏫 360°
        </a>
      </div>
    </div>
  );
}
