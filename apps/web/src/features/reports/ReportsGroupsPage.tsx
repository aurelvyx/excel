import { useState, useEffect, useMemo } from "react";
import {
  FileSpreadsheet,
  Search,
  Calendar,
  AlertCircle,
  BookOpen,
  FileCheck,
  Layers,
} from "lucide-react";
import { allRows, errorText, type Row } from "../../shared/api";
import "../academic/academic.css";

export function ReportsGroupsPage({ query: _query }: { query: URLSearchParams }) {
  const [grupos, setGrupos] = useState<Row[]>([]);
  const [periodos, setPeriodos] = useState<Row[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string>("TODOS");
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const filteredGrupos = useMemo(() => {
    return grupos.filter((g) => {
      const contexto = (g.contexto as Record<string, string>) || {};
      const matchPeriod =
        selectedPeriod === "TODOS" ||
        String(g.periodo_id || "") === selectedPeriod ||
        String(contexto.periodo || "").toLowerCase() === selectedPeriod.toLowerCase();

      const q = searchTerm.toLowerCase().trim();
      const matchSearch =
        !q ||
        String(g.codigo || "").toLowerCase().includes(q) ||
        String(contexto.unidad_nombre || "").toLowerCase().includes(q) ||
        String(contexto.idioma || "").toLowerCase().includes(q) ||
        String(contexto.nivel || "").toLowerCase().includes(q) ||
        String(contexto.docente_nombre || "").toLowerCase().includes(q);

      return matchPeriod && matchSearch;
    });
  }, [grupos, selectedPeriod, searchTerm]);

  return (
    <div className="academic-container">
      {/* Header Banner */}
      <div className="academic-card" style={{ padding: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
              <span className="academic-badge badge-green" style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                <FileSpreadsheet size={13} /> Formatos Oficiales UGEL / MINEDU (.xlsx)
              </span>
              <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                {filteredGrupos.length} salones disponibles
              </span>
            </div>

            <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#1e293b", margin: 0 }}>
              Centro de Emisión de Actas Oficiales UGEL y Reportes
            </h1>
            <p style={{ fontSize: "0.8125rem", color: "#64748b", margin: "0.35rem 0 0 0", maxWidth: "760px" }}>
              Selecciona un salón para visualizar y descargar el <strong>Acta Oficial de Evaluación UGEL (Inglés o Portugués)</strong> autollenada con la nómina en orden alfabético, calificaciones por unidad didáctica, puntaje, promedio y resumen estadístico oficial.
            </p>
          </div>

          <a
            href="#/actas"
            className="academic-btn-action btn-action-secondary"
            style={{ padding: "0.5rem 1rem", fontSize: "0.8125rem" }}
          >
            <FileCheck size={14} /> Ir a Cierre de Actas por Salón
          </a>
        </div>
      </div>

      {/* Filter Bar */}
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

        <div style={{ marginLeft: "auto", position: "relative" }}>
          <Search size={14} color="#94a3b8" style={{ position: "absolute", left: "0.65rem", top: "50%", transform: "translateY(-50%)" }} />
          <input
            type="text"
            placeholder="Buscar por código, idioma, nivel…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-field"
            style={{ paddingLeft: "2rem", width: "260px", fontSize: "0.8125rem" }}
          />
        </div>
      </div>

      {/* Lista de Salones */}
      {loading ? (
        <div className="academic-card" style={{ padding: "3rem", textAlign: "center", color: "#64748b" }}>
          Cargando salones para emisión de reportes y Actas UGEL…
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
            Ajusta el filtro de periodo o el término de búsqueda.
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
                  borderLeft: `4px solid ${isClosed ? "#475569" : "#007a3d"}`,
                  padding: "1.25rem",
                }}
              >
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                    <span className="academic-badge badge-green" style={{ fontSize: "0.75rem" }}>
                      {String(g.codigo)}
                    </span>
                    <span style={{ fontSize: "0.6875rem", color: "#64748b", fontFamily: "monospace" }}>
                      Periodo: {contexto.periodo || "—"}
                    </span>
                  </div>

                  <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "#1e293b", margin: "0.35rem 0 0.2rem 0" }}>
                    {contexto.idioma || "Idioma"} — {contexto.nivel || contexto.unidad_nombre || "Nivel"}
                  </h3>

                  <p style={{ fontSize: "0.75rem", color: "#64748b", margin: "0 0 0.75rem 0" }}>
                    Turno: <strong>{contexto.turno || "Sin turno"}</strong>
                    {contexto.seccion ? ` · Sección: ${contexto.seccion}` : ""}
                  </p>

                  <div style={{ fontSize: "0.75rem", color: "#475569", backgroundColor: "#f8fafc", padding: "0.5rem 0.75rem", borderRadius: "0.5rem", marginBottom: "1rem" }}>
                    Docente: <strong>{contexto.docente_nombre || "Por asignar"}</strong>
                    <div style={{ fontSize: "0.6875rem", color: "#64748b", marginTop: "2px" }}>
                      Matriculados: <strong>{String(g.matriculados || 0)}</strong> estudiantes
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", paddingTop: "0.75rem", borderTop: "1px solid #f1f5f9" }}>
                  <a
                    href={`#/reportes/grupos/${g.id}?tipo=ACTA_UGEL`}
                    className="academic-btn-action btn-action-primary"
                    style={{ flex: 1, justifyContent: "center", padding: "0.45rem 0.75rem" }}
                  >
                    <FileSpreadsheet size={14} /> Acta Oficial UGEL (.xlsx)
                  </a>

                  <a
                    href={`#/reportes/grupos/${g.id}?tipo=MATRIZ_NOTAS`}
                    className="academic-btn-action btn-action-secondary"
                    style={{ padding: "0.45rem 0.65rem" }}
                    title="Ver matriz completa de notas por indicador"
                  >
                    <BookOpen size={13} /> Matriz
                  </a>

                  <a
                    href={`#/reportes/grupos/${g.id}?tipo=RESUMEN_PARTICIPANTES`}
                    className="academic-btn-action btn-action-secondary"
                    style={{ padding: "0.45rem 0.65rem" }}
                    title="Ver resumen Anexo 05"
                  >
                    Anexo 05
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
