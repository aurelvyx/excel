import { useMemo, useState } from "react";
import { Lock, Unlock, Calendar, Clock, Users, CheckSquare, GraduationCap, Search, X } from "lucide-react";
import { allRows, text, type Row } from "../../shared/api";
import { useApiQuery } from "../../shared/useApiQuery";
import { Feedback, Loading } from "../../shared/ui/Feedback";
import "./academic.css";

const emptyGroups: Row[] = [];

export function TeacherClassesPage() {
  const [search, setSearch] = useState("");
  // Por defecto el docente ve sus clases habilitadas (ACTIVO), ocultando las cerradas
  const [statusFilter, setStatusFilter] = useState<"HABILITADOS" | "ACTIVO" | "PLANIFICADO" | "CERRADO">("HABILITADOS");

  const { data, loading, error, reload } = useApiQuery<Row[]>(
    "oferta/grupos",
    allRows,
  );

  const items = data ?? emptyGroups;

  const stats = useMemo(() => {
    const active = items.filter((g) => text(g, "estado") === "ACTIVO").length;
    const planned = items.filter((g) => text(g, "estado") === "PLANIFICADO").length;
    const closed = items.filter((g) => text(g, "estado") === "CERRADO").length;
    const enabled = active + planned;
    return { total: items.length, enabled, active, planned, closed };
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((group) => {
      const state = text(group, "estado");
      if (statusFilter === "HABILITADOS" && state === "CERRADO") return false;
      if (statusFilter === "ACTIVO" && state !== "ACTIVO") return false;
      if (statusFilter === "PLANIFICADO" && state !== "PLANIFICADO") return false;
      if (statusFilter === "CERRADO" && state !== "CERRADO") return false;

      if (!search.trim()) return true;
      const term = search.toLowerCase();
      const code = text(group, "codigo").toLowerCase();
      const lang = (text(group, "contexto.idioma") || text(group, "idioma")).toLowerCase();
      const level = (text(group, "contexto.nivel") || text(group, "nivel")).toLowerCase();
      const turn = (text(group, "contexto.turno") || text(group, "turno")).toLowerCase();
      const sec = (text(group, "contexto.seccion") || text(group, "seccion")).toLowerCase();
      const period = (text(group, "contexto.periodo") || text(group, "periodo")).toLowerCase();

      return (
        code.includes(term) ||
        lang.includes(term) ||
        level.includes(term) ||
        turn.includes(term) ||
        sec.includes(term) ||
        period.includes(term)
      );
    });
  }, [items, search, statusFilter]);

  return (
    <section className="academic-container">
      {/* Header Banner */}
      <div className="academic-card" style={{ padding: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <span className="academic-badge badge-green" style={{ marginBottom: "0.4rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
              <GraduationCap size={13} /> Portal Docente
            </span>
            <h1 style={{ fontSize: "1.45rem", fontWeight: 800, color: "#1e293b", margin: 0 }}>
              Mis Clases Asignadas
            </h1>
            <p style={{ fontSize: "0.8125rem", color: "#64748b", margin: "0.35rem 0 0", maxWidth: "740px" }}>
              Registra la asistencia y las calificaciones de tus grupos cuando corresponda. Las clases cerradas quedan disponibles para consulta.
            </p>
          </div>
        </div>
      </div>

      {/* KPI Stats Bar */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(185px, 1fr))",
          gap: "0.85rem",
        }}
      >
        <div
          onClick={() => setStatusFilter("HABILITADOS")}
          className="academic-card"
          style={{
            borderLeft: "4px solid #007a3d",
            cursor: "pointer",
            outline: statusFilter === "HABILITADOS" ? "2px solid #007a3d" : "none",
          }}
        >
          <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600, display: "block" }}>
            Clases Habilitadas
          </span>
          <strong style={{ fontSize: "1.5rem", color: "#007a3d" }}>
            {loading ? "…" : stats.enabled}
          </strong>
          <div style={{ fontSize: "0.6875rem", color: "#64748b", marginTop: "0.15rem" }}>
            En curso o planificadas
          </div>
        </div>

        <div
          onClick={() => setStatusFilter("ACTIVO")}
          className="academic-card"
          style={{
            borderLeft: "4px solid #16a34a",
            cursor: "pointer",
            outline: statusFilter === "ACTIVO" ? "2px solid #16a34a" : "none",
          }}
        >
          <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600, display: "block" }}>
            Salones Activos (En Curso)
          </span>
          <strong style={{ fontSize: "1.5rem", color: "#16a34a" }}>
            {loading ? "…" : stats.active}
          </strong>
          <div style={{ fontSize: "0.6875rem", color: "#166534", marginTop: "0.15rem" }}>
            Abiertos para notas y asistencia
          </div>
        </div>

        <div
          onClick={() => setStatusFilter("PLANIFICADO")}
          className="academic-card"
          style={{
            borderLeft: "4px solid #0284c7",
            cursor: "pointer",
            outline: statusFilter === "PLANIFICADO" ? "2px solid #0284c7" : "none",
          }}
        >
          <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600, display: "block" }}>
            Salones Planificados
          </span>
          <strong style={{ fontSize: "1.5rem", color: "#0284c7" }}>
            {loading ? "…" : stats.planned}
          </strong>
          <div style={{ fontSize: "0.6875rem", color: "#0369a1", marginTop: "0.15rem" }}>
            Próximos a iniciar
          </div>
        </div>

        <div
          onClick={() => setStatusFilter("CERRADO")}
          className="academic-card"
          style={{
            borderLeft: "4px solid #94a3b8",
            cursor: "pointer",
            outline: statusFilter === "CERRADO" ? "2px solid #64748b" : "none",
          }}
        >
          <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600, display: "block" }}>
            Salones cerrados
          </span>
          <strong style={{ fontSize: "1.5rem", color: "#475569" }}>
            {loading ? "…" : stats.closed}
          </strong>
          <div style={{ fontSize: "0.6875rem", color: "#94a3b8", marginTop: "0.15rem" }}>
            Solo consulta
          </div>
        </div>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="academic-filter-bar">
        <div className="academic-search-input-wrapper" style={{ maxWidth: "360px" }}>
          <Search size={15} color="#94a3b8" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por idioma, nivel, código o turno…"
            className="academic-search-input"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}
            >
              <X size={14} color="#94a3b8" />
            </button>
          )}
        </div>

        <div className="academic-filter-group" style={{ marginLeft: "auto" }}>
          <button
            type="button"
            className={`academic-filter-pill ${statusFilter === "HABILITADOS" ? "active" : ""}`}
            onClick={() => setStatusFilter("HABILITADOS")}
          >
            Habilitados ({stats.enabled})
          </button>
          <button
            type="button"
            className={`academic-filter-pill ${statusFilter === "ACTIVO" ? "active" : ""}`}
            onClick={() => setStatusFilter("ACTIVO")}
          >
            Activos ({stats.active})
          </button>
          <button
            type="button"
            className={`academic-filter-pill ${statusFilter === "PLANIFICADO" ? "active" : ""}`}
            onClick={() => setStatusFilter("PLANIFICADO")}
          >
            Planificados ({stats.planned})
          </button>
          {stats.closed > 0 && (
            <button
              type="button"
              className={`academic-filter-pill ${statusFilter === "CERRADO" ? "active" : ""}`}
              onClick={() => setStatusFilter("CERRADO")}
            >
              🔒 Cerrados ({stats.closed})
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <Loading>Cargando tus clases asignadas…</Loading>
      ) : error ? (
        <Feedback onRetry={reload}>{error}</Feedback>
      ) : !items.length ? (
        <div className="academic-card" style={{ textAlign: "center", padding: "3rem 1.5rem" }}>
          <p style={{ color: "#64748b", margin: 0, fontSize: "1rem" }}>
            Actualmente no tienes salones o clases asignadas en el sistema.
          </p>
        </div>
      ) : !filtered.length ? (
        <div className="academic-card" style={{ textAlign: "center", padding: "2.5rem 1.5rem" }}>
          <p style={{ color: "#64748b", margin: 0 }}>
            {statusFilter === "HABILITADOS" && stats.closed > 0
              ? "No tienes clases activas en este momento. Tus clases finalizadas se encuentran cerradas por administración."
              : `Ninguna clase coincide con el filtro actual.`}
          </p>
          <button
            type="button"
            className="academic-btn-action btn-action-secondary"
            style={{ margin: "1rem auto 0" }}
            onClick={() => {
              setSearch("");
              setStatusFilter("HABILITADOS");
            }}
          >
            Restablecer vista
          </button>
        </div>
      ) : (
        <div className="teacher-classes-grid">
          {filtered.map((group) => {
            const id = String(group.id);
            const code = text(group, "codigo");
            const lang = text(group, "contexto.idioma") || text(group, "idioma") || "General";
            const level = text(group, "contexto.nivel") || text(group, "nivel") || "Nivel";
            const period = text(group, "contexto.periodo") || text(group, "periodo") || "—";
            const turn = text(group, "contexto.turno") || text(group, "turno") || "Turno";
            const sec = text(group, "contexto.seccion") || text(group, "seccion") || "A";
            const state = text(group, "estado");
            const matriculados = group.matriculados ?? "—";
            const isClosed = state === "CERRADO";

            const isEnglish = lang.toLowerCase().includes("ingl");
            const isPortuguese = lang.toLowerCase().includes("portug");

            const markStyle = isClosed
              ? { bg: "#f1f5f9", color: "#64748b" }
              : isEnglish
                ? { bg: "#ecfdf5", color: "#065f46" }
                : isPortuguese
                  ? { bg: "#fef3c7", color: "#92400e" }
                  : { bg: "#eff6ff", color: "#1e40af" };

            const cardClass =
              state === "ACTIVO"
                ? "active"
                : state === "PLANIFICADO"
                  ? "planned"
                  : "closed";

            return (
              <div
                key={id}
                className={`teacher-class-card ${cardClass}`}
                style={isClosed ? { opacity: 0.78, backgroundColor: "#f8fafc" } : undefined}
              >
                <div>
                  <div className="teacher-class-header">
                    <div className="teacher-class-title-group">
                      <div
                        className="teacher-class-mark"
                        style={{ background: markStyle.bg, color: markStyle.color }}
                      >
                        {lang.slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <h3>
                          {lang} · {level}
                        </h3>
                        <small>Salón {code}</small>
                      </div>
                    </div>
                    <span
                      className={`academic-badge ${isClosed ? "badge-gray" : state === "ACTIVO" ? "badge-green" : "badge-blue"}`}
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                    >
                      {isClosed ? <Lock size={11} /> : <Unlock size={11} />}
                      {isClosed ? "CERRADO" : state}
                    </span>
                  </div>

                  <div className="teacher-class-details">
                    <div className="teacher-detail-item">
                      <Clock size={14} />
                      <span>
                        <strong>Turno:</strong> {turn} · Sección {sec}
                      </span>
                    </div>
                    <div className="teacher-detail-item">
                      <Calendar size={14} />
                      <span>
                        <strong>Periodo:</strong> {period}
                      </span>
                    </div>
                    <div className="teacher-detail-item">
                      <Users size={14} />
                      <span>
                        <strong>Estudiantes:</strong> {String(matriculados)} matriculados
                      </span>
                    </div>
                  </div>
                </div>

                {isClosed && (
                  <div
                    style={{
                      marginTop: "0.75rem",
                      padding: "0.65rem 0.85rem",
                      backgroundColor: "#f1f5f9",
                      border: "1px solid #cbd5e1",
                      borderRadius: "0.5rem",
                      fontSize: "0.75rem",
                      color: "#475569",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <Lock size={15} color="#64748b" style={{ flexShrink: 0 }} />
                    <span>Grupo cerrado. Disponible para consulta.</span>
                  </div>
                )}
                <div className="teacher-class-actions">
                  <a className="teacher-btn-attendance" href={`#/asistencia/grupos/${id}`}>
                    <CheckSquare size={15} />
                    <span>Asistencia</span>
                  </a>
                  <a className="teacher-btn-grades" href={`#/evaluacion/grupos/${id}/calificaciones`}>
                    <GraduationCap size={15} />
                    <span>Planilla de notas</span>
                  </a>
                  <a className="teacher-btn-workspace" href={`#/salones/${id}`}>
                    <span>Salón 360°</span>
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
