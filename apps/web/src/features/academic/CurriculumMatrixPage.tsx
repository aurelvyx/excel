import { useState, useEffect } from "react";
import {
  BookMarked,
  Info,
  Layers,
  Target,
  Plus,
  BookOpen,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Clock,
  GraduationCap,
  Hash,
  Globe,
  CheckCircle,
  FileSpreadsheet,
  Sparkles,
} from "lucide-react";
import { allRows, api, errorText, type Row } from "../../shared/api";
import { useAuth } from "../auth/session";
import { formulaLabel, type PlanList } from "../evaluation/model";
import { RecordForm } from "../configuration/RecordForm";
import { resources } from "../configuration/model";
import { Feedback } from "../../shared/ui/Feedback";
import "./academic.css";

const COMPONENT_COLORS = [
  "#007a3d",
  "#2563eb",
  "#7c3aed",
  "#ea580c",
  "#0891b2",
  "#db2777",
];

function creditLabel(units: Row[]) {
  if (units.some((unit) => unit.creditos == null)) return "Créditos pendientes";
  const credits = units.reduce((sum, unit) => sum + Number(unit.creditos), 0);
  return `${credits.toLocaleString("es-PE", { maximumFractionDigits: 1 })} ${
    credits === 1 ? "crédito" : "créditos"
  }`;
}

export function CurriculumMatrixPage() {
  const { session } = useAuth();
  const admin = session.user.roles.includes("ADMIN");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [idiomas, setIdiomas] = useState<Row[]>([]);
  const [niveles, setNiveles] = useState<Row[]>([]);
  const [unidades, setUnidades] = useState<Row[]>([]);
  const [selectedIdiomaFilter, setSelectedIdiomaFilter] = useState<string>("ALL");
  const [selectedNivelId, setSelectedNivelId] = useState<string>("");

  const [loadedPlans, setLoadedPlans] = useState<{
    levelId: string;
    data?: PlanList;
    error?: string;
  }>();
  const [planRevision, setPlanRevision] = useState(0);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [unitEditorLevel, setUnitEditorLevel] = useState<string>();
  const currentPlans = loadedPlans?.levelId === selectedNivelId ? loadedPlans : undefined;
  const planList = currentPlans?.data;
  const plansLoading = !!selectedNivelId && !currentPlans;

  function loadInitial(preserveNivelId?: string, signal?: AbortSignal) {
    return Promise.all([
      allRows("oferta/idiomas", signal),
      allRows("oferta/niveles", signal),
      allRows("oferta/unidades", signal),
    ])
      .then(([idms, nivs, unds]) => {
        if (signal?.aborted) return;
        setIdiomas(idms);
        setNiveles(nivs);
        setUnidades(unds);
        setError("");
        if (preserveNivelId && nivs.some((n) => String(n.id) === preserveNivelId)) {
          setSelectedNivelId(preserveNivelId);
        } else if (nivs.length) {
          setSelectedNivelId(String(nivs[0].id));
        }
      })
      .catch((err: unknown) => {
        if (!signal?.aborted) setError(errorText(err));
      })
      .finally(() => {
        if (!signal?.aborted) setLoading(false);
      });
  }

  useEffect(() => {
    const controller = new AbortController();
    void loadInitial(undefined, controller.signal);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selectedNivelId) return;
    const controller = new AbortController();
    void api<PlanList>(`evaluacion/niveles/${selectedNivelId}/planes`, {
      signal: controller.signal,
    }).then((data) => {
      if (controller.signal.aborted) return;
      setLoadedPlans({ levelId: selectedNivelId, data });
      setSelectedPlanId(
        (data.items.find((plan) => plan.estado === "APROBADO") ?? data.items[0])?.id ?? "",
      );
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted)
        setLoadedPlans({ levelId: selectedNivelId, error: errorText(reason) });
    });
    return () => controller.abort();
  }, [selectedNivelId, planRevision]);

  const filteredNiveles = niveles.filter((niv) => {
    if (selectedIdiomaFilter === "ALL") return true;
    return String(niv.idioma_id) === selectedIdiomaFilter;
  });

  const currentNivel = niveles.find((n) => String(n.id) === String(selectedNivelId));
  const currentIdioma = idiomas.find((i) => String(i.id) === String(currentNivel?.idioma_id));
  const currentUds = unidades
    .filter((u) => String(u.nivel_id) === String(selectedNivelId))
    .sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0));

  const totalHorasTeoricas = currentUds.reduce((sum, u) => sum + (Number(u.horas_teoricas) || 0), 0);
  const totalHorasPracticas = currentUds.reduce((sum, u) => sum + (Number(u.horas_practicas) || 0), 0);
  const totalHoras = totalHorasTeoricas + totalHorasPracticas;

  const activePlan =
    planList?.items.find((p) => p.id === selectedPlanId) ||
    planList?.items.find((p) => p.estado === "APROBADO") ||
    planList?.items[0];

  const totalWeightPct =
    activePlan?.estructura.evaluaciones.reduce(
      (acc, ev) => acc + (Number(ev.pesoPct) || 0),
      0,
    ) ?? 0;

  const totalIndicatorsCount =
    activePlan?.estructura.evaluaciones.reduce(
      (acc, ev) => acc + ev.indicadores.length,
      0,
    ) ?? 0;

  function openNewUnitModal() {
    if (admin && selectedNivelId) setUnitEditorLevel(selectedNivelId);
  }

  return (
    <div className="academic-container">
      {/* Hero Header Institucional */}
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
          <div style={{ maxWidth: "680px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
              <span className="academic-badge badge-green">
                <Sparkles size={11} style={{ marginRight: "0.25rem" }} />
                DISEÑO CURRICULAR Y PLAN MODULAR
              </span>
              <span className="academic-badge badge-blue">Planes y unidades didácticas</span>
            </div>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#0f172a", margin: "0 0 0.35rem 0" }}>
              Matriz Curricular y Plan Modular
            </h2>
            <p style={{ fontSize: "0.84rem", color: "#475569", margin: 0, lineHeight: 1.5 }}>
              Configura la arquitectura académica de cada nivel: <strong>Unidades Didácticas (Módulos)</strong>,{" "}
              <strong>Competencias</strong> e <strong>Indicadores de Logro ponderados</strong> que alimentan las
              el registro docente y los resultados académicos.
            </p>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: "0.5rem",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                backgroundColor: "#ffffff",
                border: "1px solid #bbf7d0",
                color: "#166534",
                padding: "0.5rem 0.85rem",
                borderRadius: "0.75rem",
                fontSize: "0.75rem",
                fontWeight: 600,
                boxShadow: "0 1px 2px rgba(0, 0, 0, 0.03)",
              }}
            >
              <Info size={15} color="#007a3d" />
              <span>Solo los planes aprobados y aplicados rigen el cálculo del grupo.</span>
            </div>

            {admin && selectedNivelId && (
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={openNewUnitModal}
                  className="academic-btn-action btn-action-secondary"
                  style={{ backgroundColor: "#ffffff" }}
                >
                  <Plus size={14} color="#007a3d" /> Nueva Unidad Didáctica
                </button>
                <a
                  href={`#/evaluacion/niveles/${selectedNivelId}`}
                  className="academic-btn-action btn-action-primary"
                >
                  <Layers size={14} /> Gestionar Versiones de Evaluación
                </a>
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="feedback error" style={{ padding: "0.75rem 1rem", borderRadius: "0.5rem" }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}
      {success && (
        <div className="feedback success" style={{ padding: "0.75rem 1rem", borderRadius: "0.5rem" }}>
          <CheckCircle2 size={16} /> {success}
        </div>
      )}

      {loading ? (
        <div className="academic-card" style={{ padding: "3.5rem", textAlign: "center", color: "#64748b" }}>
          Cargando matriz curricular y catálogo de programas…
        </div>
      ) : (
        <>
          {/* Selector de Programa de Estudio / Nivel con Filtro por Idioma */}
          <div className="academic-card" style={{ padding: "1.35rem 1.5rem" }}>
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
                <span
                  style={{
                    fontSize: "0.7rem",
                    fontWeight: 800,
                    color: "#007a3d",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  Paso 1 · Selección de Nivel
                </span>
                <h3 style={{ fontSize: "1rem", fontWeight: 800, color: "#1e293b", margin: "0.15rem 0 0 0" }}>
                  Seleccionar Programa de Estudio / Nivel Académico
                </h3>
              </div>

              {/* Píldoras de filtro por Idioma */}
              {idiomas.length > 1 && (
                <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setSelectedIdiomaFilter("ALL")}
                    style={{
                      padding: "0.3rem 0.75rem",
                      borderRadius: "999px",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      border: selectedIdiomaFilter === "ALL" ? "1px solid #007a3d" : "1px solid #e2e8f0",
                      backgroundColor: selectedIdiomaFilter === "ALL" ? "#007a3d" : "#f8fafc",
                      color: selectedIdiomaFilter === "ALL" ? "#ffffff" : "#475569",
                      cursor: "pointer",
                    }}
                  >
                    Todos ({niveles.length})
                  </button>
                  {idiomas.map((idm) => {
                    const count = niveles.filter((n) => String(n.idioma_id) === String(idm.id)).length;
                    if (count === 0) return null;
                    const active = selectedIdiomaFilter === String(idm.id);
                    return (
                      <button
                        key={idm.id}
                        type="button"
                        onClick={() => setSelectedIdiomaFilter(String(idm.id))}
                        style={{
                          padding: "0.3rem 0.75rem",
                          borderRadius: "999px",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          border: active ? "1px solid #007a3d" : "1px solid #e2e8f0",
                          backgroundColor: active ? "#007a3d" : "#f8fafc",
                          color: active ? "#ffffff" : "#475569",
                          cursor: "pointer",
                        }}
                      >
                        {String(idm.nombre)} ({count})
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Grid de Tarjetas de Nivel */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                gap: "0.75rem",
              }}
            >
              {filteredNiveles.map((niv) => {
                const idioma = idiomas.find((i) => String(i.id) === String(niv.idioma_id));
                const active = String(niv.id) === String(selectedNivelId);
                const udsForNivel = unidades.filter((u) => String(u.nivel_id) === String(niv.id));

                return (
                  <button
                    key={niv.id}
                    type="button"
                    onClick={() => setSelectedNivelId(String(niv.id))}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      gap: "0.45rem",
                      padding: "0.85rem 1rem",
                      borderRadius: "0.75rem",
                      border: active ? "2px solid #007a3d" : "1px solid #e2e8f0",
                      backgroundColor: active ? "#f0fdf4" : "#ffffff",
                      boxShadow: active
                        ? "0 4px 12px rgba(0, 122, 61, 0.12)"
                        : "0 1px 2px rgba(15, 23, 42, 0.03)",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
                      <span
                        style={{
                          fontSize: "0.6875rem",
                          fontWeight: 800,
                          textTransform: "uppercase",
                          padding: "0.15rem 0.5rem",
                          borderRadius: "999px",
                          backgroundColor: active ? "#007a3d" : "#f1f5f9",
                          color: active ? "#ffffff" : "#475569",
                        }}
                      >
                        {idioma?.nombre ? String(idioma.nombre) : "Programa"}
                      </span>
                      <span
                        style={{
                          fontFamily: "monospace",
                          fontSize: "0.72rem",
                          fontWeight: 700,
                          color: active ? "#007a3d" : "#64748b",
                        }}
                      >
                        {String(niv.codigo || "")}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", width: "100%" }}>
                      <BookMarked size={15} color={active ? "#007a3d" : "#64748b"} style={{ flexShrink: 0 }} />
                      <strong
                        style={{
                          fontSize: "0.875rem",
                          color: active ? "#064e3b" : "#1e293b",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {String(niv.nombre)}
                      </strong>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.6rem",
                        fontSize: "0.72rem",
                        color: "#64748b",
                        marginTop: "0.1rem",
                      }}
                    >
                      <span>{udsForNivel.length} {udsForNivel.length === 1 ? "unidad" : "unidades"}</span>
                      <span>·</span>
                      <span style={{ fontWeight: 600, color: active ? "#007a3d" : "#475569" }}>
                        {creditLabel(udsForNivel)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* 4 KPI Cards del Nivel Seleccionado */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
                gap: "0.85rem",
                marginTop: "1.25rem",
                paddingTop: "1.25rem",
                borderTop: "1px solid #f1f5f9",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.85rem",
                  backgroundColor: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: "0.75rem",
                  padding: "0.85rem 1rem",
                }}
              >
                <div
                  style={{
                    width: "2.5rem",
                    height: "2.5rem",
                    borderRadius: "0.65rem",
                    backgroundColor: "#eff6ff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Hash size={18} color="#2563eb" />
                </div>
                <div>
                  <p style={{ fontSize: "0.6875rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", margin: 0 }}>
                    Código del Nivel
                  </p>
                  <p style={{ fontSize: "0.95rem", fontWeight: 800, color: "#1e293b", margin: "0.15rem 0 0 0", fontFamily: "monospace" }}>
                    {currentNivel?.codigo ? String(currentNivel.codigo) : "—"}
                  </p>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.85rem",
                  backgroundColor: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: "0.75rem",
                  padding: "0.85rem 1rem",
                }}
              >
                <div
                  style={{
                    width: "2.5rem",
                    height: "2.5rem",
                    borderRadius: "0.65rem",
                    backgroundColor: "#fdf4ff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Globe size={18} color="#9333ea" />
                </div>
                <div>
                  <p style={{ fontSize: "0.6875rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", margin: 0 }}>
                    Idioma / Programa
                  </p>
                  <p style={{ fontSize: "0.95rem", fontWeight: 800, color: "#1e293b", margin: "0.15rem 0 0 0" }}>
                    {currentIdioma?.nombre ? String(currentIdioma.nombre) : "—"}
                  </p>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.85rem",
                  backgroundColor: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  borderRadius: "0.75rem",
                  padding: "0.85rem 1rem",
                }}
              >
                <div
                  style={{
                    width: "2.5rem",
                    height: "2.5rem",
                    borderRadius: "0.65rem",
                    backgroundColor: "#dcfce7",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <GraduationCap size={18} color="#007a3d" />
                </div>
                <div>
                  <p style={{ fontSize: "0.6875rem", fontWeight: 700, color: "#166534", textTransform: "uppercase", margin: 0 }}>
                    Créditos Totales (Acta)
                  </p>
                  <p style={{ fontSize: "0.95rem", fontWeight: 800, color: "#007a3d", margin: "0.15rem 0 0 0" }}>
                    {creditLabel(currentUds)}
                  </p>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.85rem",
                  backgroundColor: "#fff7ed",
                  border: "1px solid #fed7aa",
                  borderRadius: "0.75rem",
                  padding: "0.85rem 1rem",
                }}
              >
                <div
                  style={{
                    width: "2.5rem",
                    height: "2.5rem",
                    borderRadius: "0.65rem",
                    backgroundColor: "#ffedd5",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Clock size={18} color="#ea580c" />
                </div>
                <div>
                  <p style={{ fontSize: "0.6875rem", fontWeight: 700, color: "#9a3412", textTransform: "uppercase", margin: 0 }}>
                    Horas Pedagógicas
                  </p>
                  <p style={{ fontSize: "0.95rem", fontWeight: 800, color: "#c2410c", margin: "0.15rem 0 0 0" }}>
                    {totalHoras} hrs{" "}
                    <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "#9a3412" }}>
                      ({totalHorasTeoricas}T + {totalHorasPracticas}P)
                    </span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Cuerpo Principal: Estructura de Evaluación (Izquierda) + Unidades Didácticas (Derecha) */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) 370px",
              gap: "1.25rem",
              alignItems: "start",
            }}
          >
            {/* Columna Izquierda: Estructura de Evaluación y Competencias */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "0.75rem",
                }}
              >
                <div>
                  <span
                    style={{
                      fontSize: "0.7rem",
                      fontWeight: 800,
                      color: "#007a3d",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    Paso 2 · Criterios y Ponderaciones
                  </span>
                  <h3 style={{ fontSize: "1.125rem", fontWeight: 800, color: "#1e293b", margin: "0.1rem 0 0 0" }}>
                    Estructura de Evaluación y Competencias
                  </h3>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  {planList && planList.items.length > 1 && (
                    <div style={{ display: "flex", gap: "0.35rem" }}>
                      {planList.items.map((p) => {
                        const isSel = p.id === activePlan?.id;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setSelectedPlanId(p.id)}
                            style={{
                              padding: "0.3rem 0.65rem",
                              borderRadius: "0.5rem",
                              fontSize: "0.72rem",
                              fontWeight: 700,
                              border: isSel ? "1px solid #007a3d" : "1px solid #cbd5e1",
                              backgroundColor: isSel ? "#007a3d" : "#ffffff",
                              color: isSel ? "#ffffff" : "#475569",
                              cursor: "pointer",
                            }}
                          >
                            v{p.version} ({p.estado === "APROBADO" ? "Aprobado" : "Borrador"})
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {planList?.puedeCrear && (
                    <a
                      href={`#/evaluacion/niveles/${selectedNivelId}`}
                      className="academic-btn-action btn-action-primary"
                    >
                      <Plus size={14} /> Gestionar Versiones
                    </a>
                  )}
                </div>
              </div>

              {plansLoading ? (
                <div className="academic-card" style={{ padding: "2.5rem", textAlign: "center", color: "#64748b" }}>
                  Cargando versiones y estructura de evaluación…
                </div>
              ) : currentPlans?.error ? (
                <Feedback onRetry={() => {
                  setLoadedPlans(undefined);
                  setPlanRevision((value) => value + 1);
                }}>
                  {currentPlans.error}
                </Feedback>
              ) : activePlan ? (
                <div className="academic-card" style={{ padding: "1.5rem", borderTop: "4px solid #007a3d" }}>
                  {/* Encabezado de la Versión Activa */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      flexWrap: "wrap",
                      gap: "1rem",
                      marginBottom: "1rem",
                      paddingBottom: "1rem",
                      borderBottom: "1px solid #f1f5f9",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                        <span className="academic-badge badge-green">Versión {activePlan.version}</span>
                        <span
                          className={`academic-badge ${
                            activePlan.estado === "APROBADO" ? "badge-blue" : "badge-amber"
                          }`}
                        >
                          {activePlan.estado === "APROBADO" ? "✓ VERSIÓN APROBADA" : "● EN BORRADOR"}
                        </span>
                        <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                          {activePlan.estructura.evaluaciones.length} evaluaciones · {totalIndicatorsCount} indicadores
                        </span>
                      </div>

                      <h4 style={{ fontSize: "1.2rem", fontWeight: 800, color: "#0f172a", margin: "0.45rem 0 0.25rem 0" }}>
                        {activePlan.nombre}
                      </h4>
                      <p style={{ fontSize: "0.8rem", color: "#64748b", margin: 0 }}>
                        Fórmula de evaluación: <strong>{formulaLabel}</strong>
                      </p>
                    </div>

                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <a
                        href={`#/evaluacion/planes/${activePlan.id}`}
                        className="academic-btn-action btn-action-primary"
                      >
                        <ExternalLink size={13} />{" "}
                        {admin && activePlan.estado === "BORRADOR" ? "Editar / Aprobar Plan" : "Ver Plan Completo"}
                      </a>
                    </div>
                  </div>

                  {/* Barra Visual de Distribución del 100% */}
                  {activePlan.estructura.evaluaciones.length > 0 && (
                    <div
                      style={{
                        backgroundColor: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: "0.75rem",
                        padding: "0.9rem 1rem",
                        marginBottom: "1.25rem",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "0.5rem",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                        }}
                      >
                        <span style={{ color: "#334155" }}>Distribución Ponderada del Nivel</span>
                        <span
                          style={{
                            color: Math.abs(totalWeightPct - 100) < 0.01 ? "#007a3d" : "#d97706",
                          }}
                        >
                          Total acumulado: {totalWeightPct}% {Math.abs(totalWeightPct - 100) < 0.01 ? "✓" : "(Requiere 100%)"}
                        </span>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          height: "0.65rem",
                          borderRadius: "999px",
                          overflow: "hidden",
                          backgroundColor: "#e2e8f0",
                          gap: "2px",
                        }}
                      >
                        {activePlan.estructura.evaluaciones.map((comp, idx) => {
                          const w = Math.max(0, Math.min(100, Number(comp.pesoPct) || 0));
                          const color = COMPONENT_COLORS[idx % COMPONENT_COLORS.length];
                          return (
                            <div
                              key={idx}
                              style={{
                                width: `${w}%`,
                                backgroundColor: color,
                                transition: "width 0.3s ease",
                              }}
                              title={`${comp.nombre}: ${comp.pesoPct}%`}
                            />
                          );
                        })}
                      </div>

                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "0.75rem",
                          marginTop: "0.6rem",
                        }}
                      >
                        {activePlan.estructura.evaluaciones.map((comp, idx) => {
                          const color = COMPONENT_COLORS[idx % COMPONENT_COLORS.length];
                          return (
                            <div
                              key={idx}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.35rem",
                                fontSize: "0.72rem",
                                color: "#475569",
                                fontWeight: 600,
                              }}
                            >
                              <span
                                style={{
                                  width: "0.55rem",
                                  height: "0.55rem",
                                  borderRadius: "50%",
                                  backgroundColor: color,
                                  display: "inline-block",
                                }}
                              />
                              <span>{comp.nombre}</span>
                              <strong style={{ color: "#0f172a" }}>({comp.pesoPct}%)</strong>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Lista Jerárquica de Componentes e Indicadores */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                    {activePlan.estructura.evaluaciones.length > 0 ? (
                      activePlan.estructura.evaluaciones.map((comp, idx) => {
                        const color = COMPONENT_COLORS[idx % COMPONENT_COLORS.length];
                        const linkedUd = currentUds.find((u) => String(u.id) === String(comp.unidadId));

                        return (
                          <div
                            key={idx}
                            style={{
                              border: "1px solid #e2e8f0",
                              borderRadius: "0.75rem",
                              overflow: "hidden",
                              backgroundColor: "#ffffff",
                            }}
                          >
                            {/* Cabecera del Componente / Unidad */}
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                flexWrap: "wrap",
                                gap: "0.5rem",
                                padding: "0.85rem 1rem",
                                backgroundColor: "#f8fafc",
                                borderBottom: "1px solid #e2e8f0",
                                borderLeft: `4px solid ${color}`,
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                                <span
                                  style={{
                                    width: "1.65rem",
                                    height: "1.65rem",
                                    borderRadius: "0.45rem",
                                    backgroundColor: color,
                                    color: "#ffffff",
                                    fontSize: "0.75rem",
                                    fontWeight: 800,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                  }}
                                >
                                  {String(comp.orden || idx + 1).padStart(2, "0")}
                                </span>
                                <div>
                                  <strong style={{ fontSize: "0.925rem", color: "#0f172a" }}>
                                    {comp.nombre}
                                  </strong>
                                  {linkedUd && (
                                    <span
                                      style={{
                                        marginLeft: "0.5rem",
                                        fontSize: "0.7rem",
                                        fontWeight: 700,
                                        backgroundColor: "#e0f2fe",
                                        color: "#0369a1",
                                        padding: "0.15rem 0.45rem",
                                        borderRadius: "0.375rem",
                                      }}
                                    >
                                      UD: {String(linkedUd.codigo)} · {String(linkedUd.nombre)}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <span className="academic-badge badge-green" style={{ fontSize: "0.75rem" }}>
                                Peso en el nivel: {comp.pesoPct}%
                              </span>
                            </div>

                            {/* Indicadores del Componente */}
                            <div style={{ padding: "0.65rem 1rem" }}>
                              {comp.indicadores.length > 0 ? (
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                                  <thead>
                                    <tr style={{ color: "#64748b", borderBottom: "1px solid #f1f5f9", textAlign: "left" }}>
                                      <th style={{ padding: "0.4rem 0.5rem", width: "90px" }}>Código</th>
                                      <th style={{ padding: "0.4rem 0.5rem" }}>Indicador de Logro</th>
                                      <th style={{ padding: "0.4rem 0.5rem", width: "110px", textAlign: "right" }}>Ponderación</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {comp.indicadores.map((ind, iIdx) => (
                                      <tr
                                        key={iIdx}
                                        style={{
                                          borderBottom:
                                            iIdx < comp.indicadores.length - 1 ? "1px solid #f8fafc" : "none",
                                        }}
                                      >
                                        <td style={{ padding: "0.5rem" }}>
                                          <span
                                            style={{
                                              fontFamily: "monospace",
                                              fontWeight: 700,
                                              fontSize: "0.75rem",
                                              backgroundColor: "#f0fdf4",
                                              color: "#007a3d",
                                              border: "1px solid #bbf7d0",
                                              padding: "0.15rem 0.45rem",
                                              borderRadius: "0.375rem",
                                            }}
                                          >
                                            {ind.codigo}
                                          </span>
                                        </td>
                                        <td style={{ padding: "0.5rem", color: "#334155", fontWeight: 500 }}>
                                          {ind.descripcion}
                                        </td>
                                        <td
                                          style={{
                                            padding: "0.5rem",
                                            textAlign: "right",
                                            fontWeight: 700,
                                            color: "#0f172a",
                                          }}
                                        >
                                          {ind.pesoPct}%
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              ) : (
                                <p style={{ fontSize: "0.78rem", color: "#94a3b8", margin: "0.25rem 0" }}>
                                  Sin indicadores registrados en esta evaluación.
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div
                        style={{
                          padding: "1.5rem",
                          textAlign: "center",
                          backgroundColor: "#f8fafc",
                          borderRadius: "0.75rem",
                          color: "#64748b",
                        }}
                      >
                        Esta versión en borrador aún no tiene evaluaciones definidas. Haz clic en{" "}
                        <strong>Editar / Aprobar Plan</strong> para agregar evaluaciones e indicadores.
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Estado Vacío Enriquecido cuando el nivel no tiene Plan de Evaluación */
                <div
                  className="academic-card"
                  style={{
                    padding: "2.25rem 2rem",
                    background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
                    border: "1px dashed #cbd5e1",
                  }}
                >
                  <div style={{ textAlign: "center", maxWidth: "540px", margin: "0 auto" }}>
                    <div
                      style={{
                        width: "3.75rem",
                        height: "3.75rem",
                        borderRadius: "1rem",
                        backgroundColor: "#f0fdf4",
                        border: "1px solid #bbf7d0",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        margin: "0 auto 1rem auto",
                      }}
                    >
                      <FileSpreadsheet size={28} color="#007a3d" />
                    </div>

                    <span className="academic-badge badge-amber" style={{ marginBottom: "0.5rem" }}>
                      Pendiente de Configuración
                    </span>
                    <h4 style={{ fontSize: "1.15rem", fontWeight: 800, color: "#0f172a", margin: "0.35rem 0" }}>
                      Sin plan de evaluación registrado para{" "}
                      {currentNivel?.nombre ? String(currentNivel.nombre) : "este nivel"}
                    </h4>
                    <p style={{ fontSize: "0.84rem", color: "#64748b", margin: "0 0 1.5rem 0", lineHeight: 1.5 }}>
                      Define la estructura de evaluaciones e indicadores para habilitar el registro de calificaciones en
                      los grupos cuando el plan esté aprobado y aplicado.
                    </p>

                    {/* Pasos visuales */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                        gap: "0.75rem",
                        textAlign: "left",
                        marginBottom: "1.5rem",
                      }}
                    >
                      <div
                        style={{
                          backgroundColor: "#ffffff",
                          border: "1px solid #e2e8f0",
                          borderRadius: "0.65rem",
                          padding: "0.75rem",
                        }}
                      >
                        <div style={{ fontSize: "0.6875rem", fontWeight: 800, color: "#007a3d" }}>PASO 1</div>
                        <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#1e293b", marginTop: "0.15rem" }}>
                          Evaluaciones por UD
                        </div>
                        <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "0.15rem" }}>
                          Vincula cada evaluación a una Unidad Didáctica.
                        </div>
                      </div>

                      <div
                        style={{
                          backgroundColor: "#ffffff",
                          border: "1px solid #e2e8f0",
                          borderRadius: "0.65rem",
                          padding: "0.75rem",
                        }}
                      >
                        <div style={{ fontSize: "0.6875rem", fontWeight: 800, color: "#2563eb" }}>PASO 2</div>
                        <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#1e293b", marginTop: "0.15rem" }}>
                          Indicadores (100%)
                        </div>
                        <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "0.15rem" }}>
                          Define códigos (I1, I2…) y pesos que sumen 100%.
                        </div>
                      </div>

                      <div
                        style={{
                          backgroundColor: "#ffffff",
                          border: "1px solid #e2e8f0",
                          borderRadius: "0.65rem",
                          padding: "0.75rem",
                        }}
                      >
                        <div style={{ fontSize: "0.6875rem", fontWeight: 800, color: "#9333ea" }}>PASO 3</div>
                        <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#1e293b", marginTop: "0.15rem" }}>
                          Aprobar Versión
                        </div>
                        <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "0.15rem" }}>
                          Sella la versión para aplicarla a los salones activos.
                        </div>
                      </div>
                    </div>

                    {admin && (
                      <a
                        href={`#/evaluacion/niveles/${selectedNivelId}`}
                        className="academic-btn-action btn-action-primary"
                        style={{ padding: "0.6rem 1.35rem", fontSize: "0.85rem" }}
                      >
                        <Plus size={16} /> Crear primer plan de evaluación
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Columna Derecha: Unidades didácticas vinculadas */}
            <div className="academic-card" style={{ padding: "1.35rem" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "0.5rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <div
                    style={{
                      width: "2rem",
                      height: "2rem",
                      borderRadius: "0.5rem",
                      backgroundColor: "#f0fdf4",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <BookOpen size={16} color="#007a3d" />
                  </div>
                  <div>
                    <h3 style={{ fontSize: "0.95rem", fontWeight: 800, color: "#1e293b", margin: 0 }}>
                      Unidades Didácticas ({currentUds.length})
                    </h3>
                  </div>
                </div>

                {admin && selectedNivelId && (
                  <button
                    type="button"
                    onClick={openNewUnitModal}
                    className="academic-btn-action btn-action-secondary"
                    style={{ padding: "0.3rem 0.65rem", fontSize: "0.72rem" }}
                  >
                    <Plus size={13} color="#007a3d" /> Añadir UD
                  </button>
                )}
              </div>

              <p style={{ fontSize: "0.75rem", color: "#64748b", margin: "0 0 1rem 0", lineHeight: 1.45 }}>
                Unidades formativas vinculadas al nivel seleccionado.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                {currentUds.map((ud, idx) => {
                  const ht = Number(ud.horas_teoricas) || 0;
                  const hp = Number(ud.horas_practicas) || 0;
                  const hTotal = ht + hp;

                  return (
                    <div
                      key={ud.id}
                      style={{
                        padding: "0.85rem 0.95rem",
                        borderRadius: "0.75rem",
                        backgroundColor: "#ffffff",
                        border: "1px solid #e2e8f0",
                        borderLeft: "4px solid #007a3d",
                        boxShadow: "0 1px 2px rgba(15, 23, 42, 0.03)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.4rem",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          <span
                            style={{
                              fontSize: "0.65rem",
                              fontWeight: 800,
                              backgroundColor: "#f1f5f9",
                              color: "#475569",
                              padding: "0.12rem 0.4rem",
                              borderRadius: "0.25rem",
                            }}
                          >
                            UD {String(ud.orden || idx + 1).padStart(2, "0")}
                          </span>
                          <span
                            style={{
                              fontFamily: "monospace",
                              fontWeight: 800,
                              fontSize: "0.8rem",
                              color: "#007a3d",
                            }}
                          >
                            {String(ud.codigo)}
                          </span>
                        </div>

                        <span
                          style={{
                            fontSize: "0.7rem",
                            fontWeight: 800,
                            backgroundColor: "#f0fdf4",
                            color: "#166534",
                            border: "1px solid #bbf7d0",
                            padding: "0.12rem 0.5rem",
                            borderRadius: "999px",
                          }}
                        >
                          {creditLabel([ud])}
                        </span>
                      </div>

                      <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#1e293b" }}>
                        {String(ud.nombre)}
                      </div>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          paddingTop: "0.35rem",
                          borderTop: "1px dashed #f1f5f9",
                          fontSize: "0.72rem",
                          color: "#64748b",
                        }}
                      >
                        <span>
                          Teóricas: <strong>{ht}h</strong> · Prácticas: <strong>{hp}h</strong>
                        </span>
                        <span style={{ fontWeight: 700, color: "#334155" }}>Total: {hTotal} hrs</span>
                      </div>
                    </div>
                  );
                })}

                {currentUds.length === 0 && (
                  <div
                    style={{
                      padding: "1.75rem 1rem",
                      textAlign: "center",
                      backgroundColor: "#f8fafc",
                      borderRadius: "0.75rem",
                      border: "1px dashed #cbd5e1",
                    }}
                  >
                    <Target size={24} color="#94a3b8" style={{ margin: "0 auto 0.4rem auto" }} />
                    <p style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#475569", margin: "0 0 0.25rem 0" }}>
                      Sin Unidades Didácticas
                    </p>
                    <p style={{ fontSize: "0.75rem", color: "#94a3b8", margin: "0 0 0.85rem 0" }}>
                      Registra las unidades didácticas que conforman este nivel académico.
                    </p>
                    {admin && (
                      <button
                        type="button"
                        onClick={openNewUnitModal}
                        className="academic-btn-action btn-action-primary"
                        style={{ fontSize: "0.75rem", padding: "0.4rem 0.85rem" }}
                      >
                        <Plus size={13} /> Crear Primera Unidad
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Fuente de horas y créditos */}
              <div
                style={{
                  marginTop: "1rem",
                  padding: "0.75rem",
                  borderRadius: "0.65rem",
                  backgroundColor: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  display: "flex",
                  gap: "0.5rem",
                  alignItems: "flex-start",
                  fontSize: "0.72rem",
                  color: "#475569",
                }}
              >
                <CheckCircle size={15} color="#007a3d" style={{ flexShrink: 0, marginTop: "0.1rem" }} />
                <span>
                  Los créditos y horas se muestran a partir de los datos registrados en el catálogo.
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {admin && unitEditorLevel && (
        <RecordForm
          resource={resources.unidades!}
          initial={{ id: "", nivel_id: unitEditorLevel }}
          lookups={{ niveles, idiomas }}
          onClose={() => setUnitEditorLevel(undefined)}
          onSave={async (body) => {
            await api(resources.unidades!.path, { method: "POST", body });
            setUnitEditorLevel(undefined);
            setSuccess("Unidad didáctica guardada.");
            setLoading(true);
            await loadInitial(unitEditorLevel);
          }}
        />
      )}
    </div>
  );
}
