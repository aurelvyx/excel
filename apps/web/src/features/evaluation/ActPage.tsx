import { useState, useMemo } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Lock,
  Unlock,
  Users,
  RefreshCw,
  Clock,
  BookOpen,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { api, errorText } from "../../shared/api";
import { useApiQuery } from "../../shared/useApiQuery";
import { academicTime } from "../attendance/model";
import { ActActionDialog } from "./ActActionDialog";
import { ActDetailDialog, type ActCorrection } from "./ActDetailDialog";
import { ActHistory } from "./ActHistory";
import { displayedGrade } from "./grade-capture";
import type { ActRow, ActView } from "./acts-model";
import "../academic/academic.css";

type ResultFilter = "TODOS" | "APROBADO" | "DESAPROBADO" | "RETIRADO_INASISTENCIA" | "PENDIENTE";

export function ActPage({
  groupId,
  query,
}: {
  groupId: string;
  query: URLSearchParams;
}) {
  const after = query.get("after") ?? "";
  const endpoint = `evaluacion/grupos/${groupId}/acta`;
  // Pedimos un límite generoso para poder filtrar y paginar del lado del cliente si se requiere
  const search = new URLSearchParams({ limit: "100" });
  if (after) search.set("after", after);
  const queryPath = `${endpoint}?${search}`;
  const { data, loading, error, reload } = useApiQuery<ActView>(queryPath);

  if (!loading && !error && data)
    return (
      <ActReview
        key={after}
        initial={data}
        after={after}
        endpoint={endpoint}
        queryPath={queryPath}
      />
    );

  return (
    <div className="academic-container">
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
        <a
          href="#/actas"
          className="academic-btn-action btn-action-secondary"
          style={{ width: "fit-content" }}
        >
          <ArrowLeft size={14} /> Volver a Actas por Salón
        </a>
      </div>

      <div className="academic-card" style={{ padding: "3rem", textAlign: "center", color: "#64748b" }}>
        {loading ? (
          <div>
            <RefreshCw size={28} className="spin" style={{ margin: "0 auto 0.5rem", color: "#007a3d" }} />
            <p style={{ margin: 0 }}>Cargando resultados y acta oficial…</p>
          </div>
        ) : (
          <div style={{ color: "#dc2626" }}>
            <AlertCircle size={28} style={{ margin: "0 auto 0.5rem" }} />
            <p style={{ margin: 0 }}>{error}</p>
            <button
              type="button"
              onClick={reload}
              className="academic-btn-action btn-action-secondary"
              style={{ margin: "1rem auto 0" }}
            >
              Reintentar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ActReview({
  initial,
  endpoint,
  queryPath,
}: {
  initial: ActView;
  after?: string;
  endpoint: string;
  queryPath: string;
}) {
  const [data, setData] = useState(initial);
  const [busy, pending] = useState(false);
  const [stale, block] = useState(false);
  const [closing, close] = useState(false);
  const [detail, showDetail] = useState<{
    row: ActRow;
    action?: ActCorrection;
  } | null>(null);
  const [error, fail] = useState("");
  const [success, notify] = useState("");

  // Filtering & Pagination State
  const [filterType, setFilterType] = useState<ResultFilter>("TODOS");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);

  async function refresh() {
    pending(true);
    fail("");
    try {
      setData(await api<ActView>(queryPath));
      block(false);
    } catch (error) {
      fail(errorText(error));
      block(true);
    } finally {
      pending(false);
    }
  }

  async function saved(message: string) {
    close(false);
    showDetail(null);
    notify(message);
    block(true);
    await refresh();
  }

  const isClosed = !!data.cierre;

  // Filtrado de estudiantes
  const filteredStudents = useMemo(() => {
    return data.items.filter((row) => {
      // 1. Filtrar por tipo de resultado (KPI Click)
      const cond = row.calculo.condicion;
      if (filterType === "APROBADO" && cond !== "APROBADO") return false;
      if (filterType === "DESAPROBADO" && cond !== "DESAPROBADO") return false;
      if (filterType === "RETIRADO_INASISTENCIA" && cond !== "RETIRADO_INASISTENCIA") return false;
      if (filterType === "PENDIENTE" && (cond === "APROBADO" || cond === "DESAPROBADO" || cond === "RETIRADO_INASISTENCIA")) return false;

      // 2. Filtrar por buscador
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const nom = (row.estudiante || "").toLowerCase();
        const doc = (row.numero_documento || "").toLowerCase();
        const cod = (row.codigo_matricula || "").toLowerCase();
        if (!nom.includes(q) && !doc.includes(q) && !cod.includes(q)) return false;
      }
      return true;
    });
  }, [data.items, filterType, searchTerm]);

  // Paginación
  const totalPages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(filteredStudents.length / pageSize));
  const currentSafePage = Math.min(currentPage, totalPages);
  const pagedStudents = pageSize === 0
    ? filteredStudents
    : filteredStudents.slice((currentSafePage - 1) * pageSize, currentSafePage * pageSize);

  const original = data.cierre?.resumen.items ?? [];
  const names = Object.fromEntries(
    [...original, ...data.items].map((row) => [
      row.matricula_id,
      `${row.codigo_matricula} · ${row.estudiante}`,
    ]),
  );

  return (
    <div className="academic-container">
      {/* Navigation Toolbar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <a
            href="#/actas"
            className="academic-btn-action btn-action-secondary"
          >
            <ArrowLeft size={14} /> Volver a Actas por Salón
          </a>

          <a
            href={`#/salones/${data.grupo.id}`}
            className="academic-btn-action btn-action-secondary"
          >
            <Users size={14} /> Ver Salón 360°
          </a>
        </div>

        {/* Action button: Cerrar Acta Oficial */}
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => void refresh()}
            className="academic-btn-action btn-action-secondary"
            title="Recargar datos del acta"
          >
            <RefreshCw size={14} className={busy ? "spin" : ""} /> Recargar
          </button>

          {data.puedeCerrar && !isClosed && (
            <button
              type="button"
              disabled={busy || stale || closing}
              onClick={() => close(true)}
              className="academic-btn-action btn-action-primary"
              style={{ backgroundColor: "#dc2626", borderColor: "#dc2626", padding: "0.45rem 1rem" }}
            >
              <Lock size={14} /> Cerrar Acta Oficial
            </button>
          )}
        </div>
      </div>

      {/* Main Header Card */}
      <div className="academic-card" style={{ padding: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
              <span className="academic-badge badge-green">
                Salón {data.grupo.codigo}
              </span>
              <span className={`academic-badge ${isClosed ? "badge-gray" : "badge-blue"}`} style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                {isClosed ? <Lock size={12} /> : <Unlock size={12} />}
                {isClosed ? "ACTA CERRADA OFICIALMENTE" : "ACTA ABIERTA (EN REVISIÓN)"}
              </span>
              <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                Periodo: {data.grupo.contexto.periodo}
              </span>
            </div>

            <h1 style={{ fontSize: "1.375rem", fontWeight: 800, color: "#1e293b", margin: 0 }}>
              {data.grupo.contexto.idioma} — {data.grupo.contexto.nivel}
            </h1>

            <p style={{ fontSize: "0.8125rem", color: "#64748b", margin: "0.3rem 0 0" }}>
              Turno: <strong>{data.grupo.contexto.turno || "Sin turno"}</strong> · Sección: <strong>{data.grupo.contexto.seccion || "Única"}</strong>
            </p>
          </div>

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <a
              href={`#/salones/${data.grupo.id}?tab=calificaciones`}
              className="academic-btn-action btn-action-secondary"
              style={{ fontSize: "0.75rem" }}
            >
              Planilla de Calificaciones
            </a>
            <a
              href={`#/reportes/grupos/${data.grupo.id}?tipo=ACTA_UGEL`}
              className="academic-btn-action btn-action-primary"
              style={{ fontSize: "0.75rem" }}
            >
              <BookOpen size={13} /> Acta Oficial UGEL (.xlsx)
            </a>
          </div>
        </div>

        {/* Info adicional del Cierre si ya está cerrada */}
        {isClosed && data.cierre && (
          <div style={{ marginTop: "1rem", padding: "0.75rem 1rem", backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "0.5rem", fontSize: "0.8125rem", color: "#166534", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <CheckCircle2 size={18} color="#16a34a" />
              <span>
                Acta cerrada por <strong>{data.cierre.realizado_nombre}</strong> el {academicTime(data.cierre.realizado_at)}
                {data.cierre.motivo && ` · Motivo: "${data.cierre.motivo}"`}
              </span>
            </div>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, backgroundColor: "#dcfce7", padding: "0.2rem 0.5rem", borderRadius: "0.25rem" }}>
              RESULTADOS CONFIRMADOS
            </span>
          </div>
        )}
      </div>

      {/* Success / Error Feedbacks */}
      {success && (
        <div style={{ padding: "0.75rem 1rem", backgroundColor: "#dcfce7", color: "#15803d", borderRadius: "0.5rem", border: "1px solid #bbf7d0", fontSize: "0.8125rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <CheckCircle2 size={16} />
          <span>{success}</span>
        </div>
      )}
      {error && (
        <div style={{ padding: "0.75rem 1rem", backgroundColor: "#fee2e2", color: "#991b1b", borderRadius: "0.5rem", border: "1px solid #fecaca", fontSize: "0.8125rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Interactive KPI Stats Cards (Clic para filtrar automáticamente) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "0.75rem" }}>
        {/* Total Matrículas */}
        <div
          onClick={() => {
            setFilterType("TODOS");
            setCurrentPage(1);
          }}
          style={{
            backgroundColor: "#ffffff",
            padding: "1rem",
            borderRadius: "0.75rem",
            border: `2px solid ${filterType === "TODOS" ? "#007a3d" : "#e2e8f0"}`,
            cursor: "pointer",
            transition: "all 0.15s ease",
            transform: filterType === "TODOS" ? "scale(1.02)" : "none",
          }}
          title="Ver todos los estudiantes"
        >
          <div style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>Matrículas del Salón</div>
          <div style={{ fontSize: "1.375rem", fontWeight: 800, color: "#1e293b", marginTop: "0.2rem" }}>
            {data.resumen.matriculas}
          </div>
          <div style={{ fontSize: "0.6875rem", color: "#94a3b8", marginTop: "0.15rem" }}>
            Clic para mostrar todos
          </div>
        </div>

        {/* Aprobados */}
        <div
          onClick={() => {
            setFilterType("APROBADO");
            setCurrentPage(1);
          }}
          style={{
            backgroundColor: filterType === "APROBADO" ? "#f0fdf4" : "#ffffff",
            padding: "1rem",
            borderRadius: "0.75rem",
            border: `2px solid ${filterType === "APROBADO" ? "#16a34a" : "#e2e8f0"}`,
            cursor: "pointer",
            transition: "all 0.15s ease",
            transform: filterType === "APROBADO" ? "scale(1.02)" : "none",
          }}
          title="Clic para filtrar solo aprobados"
        >
          <div style={{ fontSize: "0.75rem", color: "#166534", fontWeight: 600 }}>Aprobados</div>
          <div style={{ fontSize: "1.375rem", fontWeight: 800, color: "#15803d", marginTop: "0.2rem" }}>
            {data.resumen.aprobados}
          </div>
          <div style={{ fontSize: "0.6875rem", color: "#166534", marginTop: "0.15rem" }}>
            {filterType === "APROBADO" ? "✓ Filtro activo" : "Promedio ≥ 11"}
          </div>
        </div>

        {/* Desaprobados */}
        <div
          onClick={() => {
            setFilterType("DESAPROBADO");
            setCurrentPage(1);
          }}
          style={{
            backgroundColor: filterType === "DESAPROBADO" ? "#fef2f2" : "#ffffff",
            padding: "1rem",
            borderRadius: "0.75rem",
            border: `2px solid ${filterType === "DESAPROBADO" ? "#dc2626" : "#e2e8f0"}`,
            cursor: "pointer",
            transition: "all 0.15s ease",
            transform: filterType === "DESAPROBADO" ? "scale(1.02)" : "none",
          }}
          title="Clic para filtrar solo desaprobados"
        >
          <div style={{ fontSize: "0.75rem", color: "#991b1b", fontWeight: 600 }}>Desaprobados</div>
          <div style={{ fontSize: "1.375rem", fontWeight: 800, color: "#dc2626", marginTop: "0.2rem" }}>
            {data.resumen.desaprobados}
          </div>
          <div style={{ fontSize: "0.6875rem", color: "#991b1b", marginTop: "0.15rem" }}>
            {filterType === "DESAPROBADO" ? "✓ Filtro activo" : "Promedio < 11"}
          </div>
        </div>

        {/* Inhabilitados DPI */}
        <div
          onClick={() => {
            setFilterType("RETIRADO_INASISTENCIA");
            setCurrentPage(1);
          }}
          style={{
            backgroundColor: filterType === "RETIRADO_INASISTENCIA" ? "#fff7ed" : "#ffffff",
            padding: "1rem",
            borderRadius: "0.75rem",
            border: `2px solid ${filterType === "RETIRADO_INASISTENCIA" ? "#ea580c" : "#e2e8f0"}`,
            cursor: "pointer",
            transition: "all 0.15s ease",
            transform: filterType === "RETIRADO_INASISTENCIA" ? "scale(1.02)" : "none",
          }}
          title="Clic para filtrar alumnos inhabilitados por inasistencia"
        >
          <div style={{ fontSize: "0.75rem", color: "#9a3412", fontWeight: 600 }}>Inhabilitados (DPI)</div>
          <div style={{ fontSize: "1.375rem", fontWeight: 800, color: "#c2410c", marginTop: "0.2rem" }}>
            {data.resumen.retirados}
          </div>
          <div style={{ fontSize: "0.6875rem", color: "#9a3412", marginTop: "0.15rem" }}>
            {filterType === "RETIRADO_INASISTENCIA" ? "✓ Filtro activo" : "> 30% Inasistencias"}
          </div>
        </div>
      </div>

      {/* Alerta de Pendientes si existen */}
      {data.pendientes.length > 0 && !isClosed && (
        <div style={{ padding: "1rem", backgroundColor: "#fffbeb", border: "1px solid #fef3c7", borderRadius: "0.75rem" }}>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.4rem" }}>
            <AlertTriangle size={17} color="#d97706" />
            <strong style={{ fontSize: "0.875rem", color: "#92400e" }}>
              Requisitos previos para poder cerrar el acta ({data.pendientes.length}):
            </strong>
          </div>
          <ul style={{ margin: "0 0 0 1.25rem", padding: 0, fontSize: "0.8125rem", color: "#b45309" }}>
            {data.pendientes.map((msg) => (
              <li key={msg} style={{ marginBottom: "0.25rem" }}>{msg}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Toolbar: Search, PageSize & Active Filter */}
      <div className="academic-table-toolbar">
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", flex: 1 }}>
          <div className="academic-search-input-wrapper">
            <Search size={15} color="#94a3b8" />
            <input
              type="text"
              placeholder="Buscar por estudiante, DNI o matrícula…"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="academic-search-input"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm("");
                  setCurrentPage(1);
                }}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}
              >
                <X size={14} color="#94a3b8" />
              </button>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.75rem", color: "#64748b" }}>
            <span>Mostrar:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="input-field"
              style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", width: "auto" }}
            >
              <option value={10}>10 estudiantes</option>
              <option value={20}>20 estudiantes</option>
              <option value={50}>50 estudiantes</option>
              <option value={0}>Todos</option>
            </select>
          </div>

          {filterType !== "TODOS" && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.75rem", backgroundColor: "#f1f5f9", padding: "0.25rem 0.6rem", borderRadius: "999px", color: "#334155" }}>
              <Filter size={12} color="#007a3d" />
              <span>Filtrado por: <strong>{filterType}</strong></span>
              <button
                type="button"
                onClick={() => setFilterType("TODOS")}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, marginLeft: "0.25rem" }}
              >
                <X size={13} color="#64748b" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tabla de Resultados de Estudiantes Simplificada y Moderna */}
      <div className="academic-card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
            <thead>
              <tr style={{ backgroundColor: "#f8fafc", borderBottom: "2px solid #e2e8f0", color: "#475569", textAlign: "left" }}>
                <th style={{ padding: "0.75rem 1rem", width: "45px" }}>N°</th>
                <th style={{ padding: "0.75rem 1rem" }}>Estudiante / Matrícula</th>
                <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Asistencia (% Faltas)</th>
                <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Promedio Vigesimal</th>
                <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Condición Académica</th>
                <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {pagedStudents.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: "3rem", textAlign: "center", color: "#94a3b8" }}>
                    No se encontraron estudiantes con los filtros aplicados.
                  </td>
                </tr>
              ) : (
                pagedStudents.map((row, idx) => {
                  const globalIdx = pageSize === 0 ? idx + 1 : (currentSafePage - 1) * pageSize + idx + 1;
                  const cond = row.calculo.condicion;
                  const isAprobado = cond === "APROBADO";
                  const isDesaprobado = cond === "DESAPROBADO";
                  const isDpi = cond === "RETIRADO_INASISTENCIA";

                  const badgeStyle = isAprobado
                    ? { bg: "#dcfce7", text: "#166534", border: "#bbf7d0", label: "APROBADO" }
                    : isDpi
                    ? { bg: "#fee2e2", text: "#991b1b", border: "#fecaca", label: "DPI (FALTAS)" }
                    : isDesaprobado
                    ? { bg: "#fee2e2", text: "#dc2626", border: "#fecaca", label: "DESAPROBADO" }
                    : { bg: "#fef3c7", text: "#92400e", border: "#fde68a", label: "PENDIENTE" };

                  const inasistenciaPct = row.resumenAsistencia?.inasistenciaPct !== null && row.resumenAsistencia?.inasistenciaPct !== undefined
                    ? `${row.resumenAsistencia.inasistenciaPct}%`
                    : "—";

                  const prom = row.resumenNotas?.promedio !== null && row.resumenNotas?.promedio !== undefined
                    ? displayedGrade(row.resumenNotas.promedio)
                    : "—";

                  const notaOficial = row.resumenNotas?.notaOficial;

                  return (
                    <tr key={row.matricula_id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      {/* N° */}
                      <td style={{ padding: "0.75rem 1rem", color: "#94a3b8" }}>{globalIdx}</td>

                      {/* Estudiante y Documento */}
                      <td style={{ padding: "0.75rem 1rem" }}>
                        <div style={{ fontWeight: 600, color: "#1e293b", fontSize: "0.875rem" }}>
                          {row.estudiante}
                        </div>
                        <div style={{ fontSize: "0.6875rem", color: "#64748b", fontFamily: "monospace", marginTop: "2px" }}>
                          {row.tipo_documento} {row.numero_documento} · Matrícula: {row.codigo_matricula}
                        </div>
                      </td>

                      {/* Asistencia Resumen */}
                      <td style={{ padding: "0.75rem 1rem", textAlign: "center" }}>
                        <div style={{ fontWeight: 700, color: Number(row.resumenAsistencia?.inasistenciaPct || 0) >= 30 ? "#dc2626" : "#1e293b" }}>
                          {inasistenciaPct}
                        </div>
                        <div style={{ fontSize: "0.6875rem", color: "#64748b" }}>
                          Faltas: {row.resumenAsistencia?.faltas || 0} de {row.resumenAsistencia?.sesionesComputables || 0} ses.
                        </div>
                      </td>

                      {/* Promedio Vigesimal */}
                      <td style={{ padding: "0.75rem 1rem", textAlign: "center" }}>
                        <div style={{ fontSize: "1rem", fontWeight: 800, color: isAprobado ? "#166534" : isDesaprobado || isDpi ? "#dc2626" : "#64748b" }}>
                          {notaOficial !== null && notaOficial !== undefined ? notaOficial : prom}
                        </div>
                        <div style={{ fontSize: "0.6875rem", color: "#94a3b8" }}>
                          {row.resumenNotas?.calificacionesRegistradas || 0} / {row.resumenNotas?.calificacionesEsperadas || 0} notas
                        </div>
                      </td>

                      {/* Condición Académica */}
                      <td style={{ padding: "0.75rem 1rem", textAlign: "center" }}>
                        <span
                          style={{
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            padding: "0.25rem 0.6rem",
                            borderRadius: "0.375rem",
                            backgroundColor: badgeStyle.bg,
                            color: badgeStyle.text,
                            border: `1px solid ${badgeStyle.border}`,
                            display: "inline-block",
                          }}
                        >
                          {badgeStyle.label}
                        </span>
                        {isClosed && row.resultado?.confirmado_at && (
                          <div style={{ fontSize: "0.625rem", color: "#16a34a", marginTop: "2px" }}>
                            Confirmado en acta
                          </div>
                        )}
                      </td>

                      {/* Acciones */}
                      <td style={{ padding: "0.75rem 1rem", textAlign: "right" }}>
                        <div style={{ display: "flex", gap: "0.35rem", justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            disabled={busy || stale}
                            onClick={() => showDetail({ row })}
                            className="academic-btn-action btn-action-secondary"
                            style={{ fontSize: "0.6875rem", padding: "0.25rem 0.5rem" }}
                          >
                            Detalle
                          </button>

                          {data.puedeCorregir && row.resultado?.cierre_id === data.cierre?.id && (
                            <button
                              type="button"
                              disabled={busy || stale}
                              onClick={() => showDetail({ row, action: "grade" })}
                              className="academic-btn-action btn-action-secondary"
                              style={{ fontSize: "0.6875rem", padding: "0.25rem 0.5rem", color: "#0284c7" }}
                            >
                              Corregir
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación limpia */}
        {filteredStudents.length > 0 && pageSize > 0 && totalPages > 1 && (
          <div className="academic-pagination" style={{ margin: "0.75rem 1rem" }}>
            <div>
              Mostrando{" "}
              <strong style={{ color: "#1e293b" }}>
                {(currentSafePage - 1) * pageSize + 1} - {Math.min(currentSafePage * pageSize, filteredStudents.length)}
              </strong>{" "}
              de <strong style={{ color: "#1e293b" }}>{filteredStudents.length}</strong> estudiantes
              {(searchTerm || filterType !== "TODOS") && ` (filtrados de ${data.items.length})`}
            </div>

            <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
              <button
                type="button"
                disabled={currentSafePage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="academic-page-btn"
              >
                <ChevronLeft size={14} /> Anterior
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                <button
                  key={pageNum}
                  type="button"
                  onClick={() => setCurrentPage(pageNum)}
                  className={`academic-page-btn ${pageNum === currentSafePage ? "active" : ""}`}
                  style={{ width: "2rem", padding: "0.35rem 0" }}
                >
                  {pageNum}
                </button>
              ))}

              <button
                type="button"
                disabled={currentSafePage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="academic-page-btn"
              >
                Siguiente <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Historial Inmutable si está cerrada */}
      {data.historial && data.historial.length > 0 && (
        <div className="academic-card" style={{ padding: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
            <Clock size={16} color="#64748b" />
            <h4 style={{ margin: 0, color: "#1e293b", fontSize: "0.9375rem" }}>Historial y Auditoría del Acta</h4>
          </div>
          <ActHistory items={data.historial} labels={names} />
        </div>
      )}

      {/* Modal Dialog: Cerrar Acta Oficial */}
      {closing && (
        <ActActionDialog
          title="Confirmar Cierre Oficial de Acta"
          context={
            <div style={{ padding: "0.75rem", backgroundColor: "#f8fafc", borderRadius: "0.5rem", border: "1px solid #e2e8f0", fontSize: "0.8125rem", color: "#334155" }}>
              <strong>Grupo {data.grupo.codigo}</strong> · {data.grupo.contexto.periodo} · {data.grupo.contexto.idioma} — {data.grupo.contexto.nivel}
              <div style={{ marginTop: "0.35rem", fontSize: "0.75rem", color: "#64748b" }}>
                Total de matrículas revisables: {data.resumen.matriculas} (Aprobados: {data.resumen.aprobados}, Desaprobados: {data.resumen.desaprobados}, DPI: {data.resumen.retirados})
              </div>
            </div>
          }
          reviewContent={
            <p style={{ fontSize: "0.8125rem", color: "#475569" }}>
              Al confirmar el cierre, se congelarán de manera definitiva las notas de los alumnos y las matrículas pasarán a estado <strong>CERRADA</strong>.
            </p>
          }
          consequence="Esta acción confirma legalmente los resultados del salón. No se podrán reabrir notas sin una resolución de rectificación formal."
          onClose={() => close(false)}
          onConflict={() => block(true)}
          onReload={() => {
            close(false);
            void refresh();
          }}
          onConfirm={async (reason) => {
            await api(endpoint, {
              method: "POST",
              body: { revision: data.revision, motivo: reason },
            });
            await saved("Acta cerrada y resultados confirmados exitosamente.");
          }}
        />
      )}

      {/* Modal Detail & Correction Dialog */}
      {detail && (
        <ActDetailDialog
          row={detail.row}
          initialAction={detail.action}
          endpoint={endpoint}
          onClose={() => showDetail(null)}
          onSaved={(changed) =>
            saved(
              changed
                ? "Corrección registrada y resultado recalculado."
                : "No hay cambios: el registro conserva sus valores.",
            )
          }
          onConflict={() => block(true)}
          onReload={() => {
            showDetail(null);
            void refresh();
          }}
        />
      )}
    </div>
  );
}
