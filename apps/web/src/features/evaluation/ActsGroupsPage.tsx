import { useState, useMemo } from "react";
import {
  FileCheck,
  Search,
  AlertCircle,
  Calendar,
  Lock,
  Unlock,
  ArrowRight,
  BookOpen,
  Filter,
  Layers,
} from "lucide-react";
import { allRows, type Row } from "../../shared/api";
import { useApiQuery } from "../../shared/useApiQuery";
import type { Access } from "../../app/access";
import "../academic/academic.css";

const emptyRows: Row[] = [];

export function ActsGroupsPage({ access }: { access: Access }) {
  const [selectedPeriod, setSelectedPeriod] = useState<string>("TODOS");
  const [statusFilter, setStatusFilter] = useState<"TODOS" | "ACTIVO" | "CERRADO">("TODOS");
  const [searchTerm, setSearchTerm] = useState("");
  const groups = useApiQuery<Row[]>("oferta/grupos", allRows);
  const periods = useApiQuery<Row[]>("oferta/periodos", allRows);
  const grupos = groups.data ?? emptyRows;
  const periodos = periods.data ?? emptyRows;
  const loading = groups.loading || periods.loading;
  const error = groups.error || periods.error;

  // Grupos filtrados
  const filteredGrupos = useMemo(() => {
    return grupos.filter((g) => {
      const contexto = (g.contexto as Record<string, string>) || {};
      const matchPeriod =
        selectedPeriod === "TODOS" ||
        String(g.periodo_id || "") === selectedPeriod ||
        String(contexto.periodo || "").toLowerCase() === selectedPeriod.toLowerCase();

      const matchStatus =
        statusFilter === "TODOS" ||
        (statusFilter === "ACTIVO" && g.estado === "ACTIVO") ||
        (statusFilter === "CERRADO" && g.estado === "CERRADO");

      const q = searchTerm.toLowerCase().trim();
      const matchSearch =
        !q ||
        String(g.codigo || "").toLowerCase().includes(q) ||
        String(contexto.unidad_nombre || "").toLowerCase().includes(q) ||
        String(contexto.idioma || "").toLowerCase().includes(q) ||
        String(contexto.docente_nombre || "").toLowerCase().includes(q);

      return matchPeriod && matchStatus && matchSearch;
    });
  }, [grupos, selectedPeriod, statusFilter, searchTerm]);

  // Estadísticas del periodo seleccionado
  const periodStats = useMemo(() => {
    const total = filteredGrupos.length;
    const activos = filteredGrupos.filter((g) => g.estado === "ACTIVO").length;
    const cerrados = filteredGrupos.filter((g) => g.estado === "CERRADO").length;
    const totalAlumnos = filteredGrupos.reduce((acc, g) => acc + (Number(g.matriculados) || 0), 0);
    return { total, activos, cerrados, totalAlumnos };
  }, [filteredGrupos]);

  return (
    <div className="academic-container">
      {/* Header Banner */}
      <div className="academic-card" style={{ padding: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
              <span className="academic-badge badge-green" style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                <FileCheck size={13} /> Cierre y Auditoría
              </span>
              <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                {filteredGrupos.length} salones en gestión
              </span>
            </div>

            <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#1e293b", margin: 0 }}>
              Actas de cierre por salón
            </h1>
            <p style={{ fontSize: "0.8125rem", color: "#64748b", margin: "0.35rem 0 0 0", maxWidth: "720px" }}>
              Consulta calificaciones y resultados del grupo. El cierre del acta se realiza desde el detalle con permisos de administración.
            </p>
          </div>

          {access.reports && (
            <a
              href="#/reportes"
              className="academic-btn-action btn-action-secondary"
              style={{ padding: "0.5rem 1rem", fontSize: "0.8125rem" }}
            >
              <BookOpen size={14} /> Reportes de demostración XLSX
            </a>
          )}
        </div>
      </div>

      {/* KPI Stats Bar por Periodo */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem" }}>
        <div style={{ backgroundColor: "#ffffff", padding: "1rem", borderRadius: "0.75rem", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <div style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>Total de Salones</div>
          <div style={{ fontSize: "1.375rem", fontWeight: 800, color: "#1e293b", marginTop: "0.25rem" }}>
            {periodStats.total}
          </div>
          <div style={{ fontSize: "0.6875rem", color: "#94a3b8", marginTop: "0.2rem" }}>
            Periodo: {selectedPeriod}
          </div>
        </div>

        <div style={{ backgroundColor: "#ffffff", padding: "1rem", borderRadius: "0.75rem", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <div style={{ fontSize: "0.75rem", color: "#007a3d", fontWeight: 600 }}>Salones en Curso</div>
          <div style={{ fontSize: "1.375rem", fontWeight: 800, color: "#007a3d", marginTop: "0.25rem" }}>
            {periodStats.activos}
          </div>
          <div style={{ fontSize: "0.6875rem", color: "#166534", marginTop: "0.2rem" }}>
            Asistencias / notas abiertas
          </div>
        </div>

        <div style={{ backgroundColor: "#ffffff", padding: "1rem", borderRadius: "0.75rem", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <div style={{ fontSize: "0.75rem", color: "#475569", fontWeight: 600 }}>Salones Finalizados</div>
          <div style={{ fontSize: "1.375rem", fontWeight: 800, color: "#334155", marginTop: "0.25rem" }}>
            {periodStats.cerrados}
          </div>
          <div style={{ fontSize: "0.6875rem", color: "#64748b", marginTop: "0.2rem" }}>
            Ciclo terminado
          </div>
        </div>

        <div style={{ backgroundColor: "#ffffff", padding: "1rem", borderRadius: "0.75rem", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <div style={{ fontSize: "0.75rem", color: "#1d4ed8", fontWeight: 600 }}>Alumnos Evaluados</div>
          <div style={{ fontSize: "1.375rem", fontWeight: 800, color: "#1d4ed8", marginTop: "0.25rem" }}>
            {periodStats.totalAlumnos}
          </div>
          <div style={{ fontSize: "0.6875rem", color: "#2563eb", marginTop: "0.2rem" }}>
            Matrículas registradas
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="academic-filter-bar">
        <div className="academic-filter-group">
          <Calendar size={16} color="#007a3d" />
          <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
            Periodo:
          </span>
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="input-field"
            style={{ padding: "0.35rem 0.75rem", fontSize: "0.8125rem", width: "auto" }}
          >
            <option value="TODOS">Todos los periodos</option>
            {periodos.map((p) => (
              <option key={String(p.id)} value={String(p.id)}>
                {String(p.nombre || p.codigo)} {p.estado === "ABIERTO" ? "(Abierto)" : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Status Pills */}
        <div className="academic-filter-group">
          <Filter size={15} color="#94a3b8" />
          <span style={{ fontSize: "0.75rem", color: "#64748b" }}>Estado del Salón:</span>
          <button
            type="button"
            onClick={() => setStatusFilter("TODOS")}
            className={`academic-filter-pill ${statusFilter === "TODOS" ? "active" : ""}`}
          >
            Todos
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("ACTIVO")}
            className={`academic-filter-pill ${statusFilter === "ACTIVO" ? "active" : ""}`}
          >
            Activos
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("CERRADO")}
            className={`academic-filter-pill ${statusFilter === "CERRADO" ? "active" : ""}`}
          >
            Finalizados / Cerrados
          </button>
        </div>

        {/* Search */}
        <div style={{ marginLeft: "auto", position: "relative" }}>
          <Search size={14} color="#94a3b8" style={{ position: "absolute", left: "0.65rem", top: "50%", transform: "translateY(-50%)" }} />
          <input
            type="text"
            placeholder="Buscar por código, curso, docente…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-field"
            style={{ paddingLeft: "2rem", width: "240px", fontSize: "0.8125rem" }}
          />
        </div>
      </div>

      {/* Grid of Salones */}
      {loading ? (
        <div className="academic-card" style={{ padding: "3rem", textAlign: "center", color: "#64748b" }}>
          Cargando salones para auditoría y cierre de actas…
        </div>
      ) : error ? (
        <div className="academic-card" style={{ padding: "1.5rem", color: "#dc2626", display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      ) : filteredGrupos.length === 0 ? (
        <div className="academic-card" style={{ padding: "3rem", textAlign: "center", color: "#94a3b8" }}>
          <Layers size={36} color="#cbd5e1" style={{ margin: "0 auto 0.75rem auto" }} />
          <h3 style={{ margin: 0, color: "#334155" }}>No se encontraron salones</h3>
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.8125rem" }}>
            Ajusta el filtro de periodo o el término de búsqueda para ver más salones.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "1rem" }}>
          {filteredGrupos.map((g) => {
            const contexto = (g.contexto as Record<string, string>) || {};
            const isClosed = g.estado === "CERRADO";

            return (
              <div
                key={String(g.id)}
                className="academic-card"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  borderLeft: `4px solid ${isClosed ? "#94a3b8" : "#007a3d"}`,
                  padding: "1.25rem",
                  transition: "transform 0.15s ease, box-shadow 0.15s ease",
                }}
              >
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                    <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                      <span className="academic-badge badge-green" style={{ fontSize: "0.75rem" }}>
                        {String(g.codigo)}
                      </span>
                      <span className={`academic-badge ${isClosed ? "badge-gray" : "badge-blue"}`} style={{ fontSize: "0.6875rem" }}>
                        {isClosed ? <Lock size={11} style={{ marginRight: "3px" }} /> : <Unlock size={11} style={{ marginRight: "3px" }} />}
                        {String(g.estado ?? "Sin estado")}
                      </span>
                    </div>

                    <span style={{ fontSize: "0.6875rem", color: "#64748b", fontFamily: "monospace" }}>
                      {contexto.periodo || ""}
                    </span>
                  </div>

                  <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "#1e293b", margin: "0.35rem 0 0.2rem 0" }}>
                    {contexto.unidad_nombre ? String(contexto.unidad_nombre) : "Salón de Clase"}
                  </h3>

                  <p style={{ fontSize: "0.75rem", color: "#64748b", margin: "0 0 0.75rem 0" }}>
                    {contexto.nivel_nombre ? `${contexto.nivel_nombre} · ` : ""}
                    Turno: <strong>{contexto.turno || "Sin turno"}</strong>
                    {contexto.seccion ? ` · Sec: ${contexto.seccion}` : ""}
                  </p>

                  <div style={{ fontSize: "0.75rem", color: "#475569", backgroundColor: "#f8fafc", padding: "0.5rem 0.75rem", borderRadius: "0.5rem", marginBottom: "1rem" }}>
                    Docente: <strong>{contexto.docente_nombre || "No asignado"}</strong>
                    <div style={{ fontSize: "0.6875rem", color: "#64748b", marginTop: "2px" }}>
                      Matriculados: <strong>{String(g.matriculados ?? "—")}</strong> / Capacidad: {String(g.capacidad ?? "—")}
                    </div>
                  </div>
                </div>

                {/* Card Action Buttons */}
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", paddingTop: "0.75rem", borderTop: "1px solid #f1f5f9" }}>
                  <a
                    href={`#/evaluacion/grupos/${g.id}/acta`}
                    className="academic-btn-action btn-action-primary"
                    style={{ flex: 1, justifyContent: "center", padding: "0.45rem 0.75rem" }}
                  >
                    <FileCheck size={14} /> Revisar acta <ArrowRight size={13} />
                  </a>

                  <a
                    href={`#/salones/${g.id}?tab=calificaciones`}
                    className="academic-btn-action btn-action-secondary"
                    title="Ir a la planilla de calificaciones del salón"
                    style={{ padding: "0.45rem 0.65rem" }}
                  >
                    Notas
                  </a>

                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
