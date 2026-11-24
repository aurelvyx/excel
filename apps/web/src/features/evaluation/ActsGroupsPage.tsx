import { useState, useEffect, useMemo } from "react";
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
  SlidersHorizontal,
  CheckCircle2,
  Layers,
} from "lucide-react";
import { allRows, errorText, type Row } from "../../shared/api";
import type { Access } from "../../app/access";
import { GroupStatusModal } from "../academic/components/GroupStatusModal";
import { PageHeader, StatCard, StatCardGrid } from "../../components/shared";
import "../academic/academic.css";

export function ActsGroupsPage({ access }: { access: Access }) {
  const [grupos, setGrupos] = useState<Row[]>([]);
  const [periodos, setPeriodos] = useState<Row[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string>("TODOS");
  const [statusFilter, setStatusFilter] = useState<"TODOS" | "ACTIVO" | "CERRADO">("TODOS");
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Modal para cambiar estado del salón directamente
  const [statusModalGroup, setStatusModalGroup] = useState<Row | null>(null);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [grps, perds] = await Promise.all([
        allRows("oferta/grupos"),
        allRows("oferta/periodos"),
      ]);
      setGrupos(grps);
      setPeriodos(perds);
      const activo = perds.find((p) => p.estado === "ACTIVO" || p.estado === "PLANIFICADO");
      if (activo?.id && selectedPeriod === "TODOS") {
        setSelectedPeriod(String(activo.id));
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

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
    <div className="ds-page academic-container">
      <PageHeader
        variant="hero"
        icon={<FileCheck size={22} strokeWidth={1.75} />}
        eyebrow="Cierre y Auditoría"
        statusPill={`${filteredGrupos.length} salones en gestión`}
        title="Actas Oficiales de Cierre de Salón"
        description={
          <>
            Gestión centralizada del término de ciclo lectivo. Permite finalizar
            y cambiar el estado del salón, auditar calificaciones finales y
            aplicar el <strong>cierre oficial de Acta</strong> para congelar
            notas y confirmar resultados de los estudiantes.
          </>
        }
        actions={
          access.reports ? (
            <a href="#/reportes" className="button">
              <BookOpen size={14} strokeWidth={1.75} />
              Reportes y Matrices
            </a>
          ) : undefined
        }
      />

      {success && (
        <div style={{ padding: "0.75rem 1rem", backgroundColor: "#dcfce7", color: "#15803d", borderRadius: "0.625rem", border: "1px solid #bbf7d0", fontSize: "0.8125rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <CheckCircle2 size={16} />
          <span>{success}</span>
        </div>
      )}

      {/* KPI Stats Bar por Periodo */}
      <StatCardGrid label="Resumen de actas y salones">
        <StatCard
          label="Total de Salones"
          value={periodStats.total}
          sublabel={`Periodo: ${selectedPeriod}`}
          icon={<Layers size={18} strokeWidth={1.75} />}
          tone="slate"
        />
        <StatCard
          label="Salones en Curso"
          value={periodStats.activos}
          sublabel="Asistencias y notas abiertas"
          icon={<Unlock size={18} strokeWidth={1.75} />}
          tone="emerald"
        />
        <StatCard
          label="Salones Finalizados"
          value={periodStats.cerrados}
          sublabel="Ciclo terminado / Acta cerrada"
          icon={<Lock size={18} strokeWidth={1.75} />}
          tone="slate"
        />
        <StatCard
          label="Alumnos Evaluados"
          value={periodStats.totalAlumnos}
          sublabel="Matrículas registradas"
          icon={<CheckCircle2 size={18} strokeWidth={1.75} />}
          tone="blue"
        />
      </StatCardGrid>

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
                {String(p.nombre || p.codigo)} {p.estado === "ACTIVO" ? "(Vigente)" : ""}
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
                        {isClosed ? "SALÓN FINALIZADO" : "SALÓN ACTIVO"}
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
                      Matriculados: <strong>{String(g.matriculados || 0)}</strong> / Capacidad: {String(g.capacidad || 40)}
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
                    <FileCheck size={14} /> Revisar y Cerrar Acta <ArrowRight size={13} />
                  </a>

                  {/* Botón para cambiar estado del salón (Activo <-> Cerrado) */}
                  <button
                    type="button"
                    onClick={() => setStatusModalGroup(g)}
                    className="academic-btn-action btn-action-secondary"
                    title="Cambiar estado administrativo del salón (Planificado, Activo o Cerrado)"
                    style={{ padding: "0.45rem 0.65rem" }}
                  >
                    <SlidersHorizontal size={13} /> Estado
                  </button>

                  <a
                    href={`#/salones/${g.id}?tab=calificaciones`}
                    className="academic-btn-action btn-action-secondary"
                    title="Ir a la planilla de calificaciones del salón"
                    style={{ padding: "0.45rem 0.65rem" }}
                  >
                    Notas
                  </a>

                  <a
                    href={`#/reportes/grupos/${g.id}?tipo=ACTA_UGEL`}
                    className="academic-btn-action btn-action-secondary"
                    title="Generar Acta Oficial de Evaluación UGEL en Excel (.xlsx)"
                    style={{ padding: "0.45rem 0.65rem" }}
                  >
                    Acta UGEL
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal para cambiar estado administrativo del salón */}
      {statusModalGroup && (
        <GroupStatusModal
          group={statusModalGroup}
          onClose={() => setStatusModalGroup(null)}
          onUpdated={async () => {
            setSuccess(`¡Estado del salón ${statusModalGroup.codigo} actualizado!`);
            await loadData();
          }}
        />
      )}
    </div>
  );
}
