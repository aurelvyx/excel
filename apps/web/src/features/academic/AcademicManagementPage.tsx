import { useState, useEffect } from "react";
import {
  BookOpen,
  Clock,
  Users,
  Plus,
  ChevronRight,
  GraduationCap,
  Calendar,
  AlertCircle,
  CheckCircle2,
  X,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { allRows, api, errorText, type Row } from "../../shared/api";
import { useAuth } from "../auth/session";
import "./academic.css";

type Tab = "programas" | "grupos" | "docentes";

export function AcademicManagementPage() {
  const { session } = useAuth();
  const admin = session.user.roles.includes("ADMIN");
  const [tab, setTab] = useState<Tab>("grupos");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Data
  const [idiomas, setIdiomas] = useState<Row[]>([]);
  const [niveles, setNiveles] = useState<Row[]>([]);
  const [unidades, setUnidades] = useState<Row[]>([]);
  const [grupos, setGrupos] = useState<Row[]>([]);
  const [turnos, setTurnos] = useState<Row[]>([]);
  const [secciones, setSecciones] = useState<Row[]>([]);
  const [periodos, setPeriodos] = useState<Row[]>([]);
  const [docentes, setDocentes] = useState<Row[]>([]);

  // Salones filter states (Prioritizes Active groups)
  const [filterPeriodo, setFilterPeriodo] = useState<string>("all");
  const [filterEstado, setFilterEstado] = useState<"ACTIVO" | "PLANIFICADO" | "CERRADO" | "TODOS">("ACTIVO");
  const [searchSalon, setSearchSalon] = useState<string>("");

  // Salón status edit modal
  const [statusModalGroup, setStatusModalGroup] = useState<Row | null>(null);
  const [newEstado, setNewEstado] = useState<"PLANIFICADO" | "ACTIVO" | "CERRADO">("ACTIVO");
  const [estadoMotivo, setEstadoMotivo] = useState("");
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState("");

  // Dialog states for creation
  const [modalType, setModalType] = useState<"grupo" | "unidad" | "nivel" | null>(null);
  const [selectedLevelId, setSelectedLevelId] = useState<string>("");
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState("");

  // Form states
  const [grupoForm, setGrupoForm] = useState({
    periodoId: "",
    nivelId: "",
    turnoId: "",
    seccionId: "",
    codigo: "",
    capacidad: "25",
    estado: "PLANIFICADO",
  });

  const [unitForm, setUnitForm] = useState({
    codigo: "",
    nombre: "",
    creditos: "4",
    horasTeoricas: "40",
    horasPracticas: "0",
    orden: "1",
    activo: true,
  });

  const [nivelForm, setNivelForm] = useState({
    idiomaId: "",
    codigo: "",
    nombre: "",
    orden: "1",
    duracionMeses: "1",
    activo: true,
  });

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [idms, nivs, unds, grps, trns, secs, perds, docs] = await Promise.all([
        allRows("oferta/idiomas"),
        allRows("oferta/niveles"),
        allRows("oferta/unidades"),
        allRows("oferta/grupos"),
        allRows("oferta/turnos"),
        allRows("oferta/secciones"),
        allRows("oferta/periodos"),
        allRows("docentes").catch(() => []),
      ]);
      setIdiomas(idms);
      setNiveles(nivs);
      setUnidades(unds);
      setGrupos(grps);
      setTurnos(trns);
      setSecciones(secs);
      setPeriodos(perds);
      setDocentes(docs);

      // Preselect default IDs in forms
      if (perds.length) setGrupoForm((f) => ({ ...f, periodoId: String(perds[0].id) }));
      if (nivs.length) setGrupoForm((f) => ({ ...f, nivelId: String(nivs[0].id) }));
      if (trns.length) setGrupoForm((f) => ({ ...f, turnoId: String(trns[0].id) }));
      if (secs.length) setGrupoForm((f) => ({ ...f, seccionId: String(secs[0].id) }));
      if (idms.length) setNivelForm((f) => ({ ...f, idiomaId: String(idms[0].id) }));

      // Select default active period or 'all' if it has groups
      const activoPerd = perds.find((p) => p.estado === "ACTIVO" || p.estado === "PLANIFICADO");
      if (activoPerd) {
        const hasGroupsInActive = grps.some((g) => String(g.periodo_id) === String(activoPerd.id));
        if (hasGroupsInActive) {
          setFilterPeriodo(String(activoPerd.id));
          const hasActiveGroups = grps.some((g) => String(g.periodo_id) === String(activoPerd.id) && String(g.estado).toUpperCase() === "ACTIVO");
          if (!hasActiveGroups) {
            setFilterEstado("TODOS");
          }
        } else {
          setFilterPeriodo("all");
          setFilterEstado("TODOS");
        }
      } else {
        setFilterPeriodo("all");
        setFilterEstado("TODOS");
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

  async function handleCreateGrupo(e: React.FormEvent) {
    e.preventDefault();
    setFormBusy(true);
    setFormError("");
    try {
      await api("oferta/grupos", {
        method: "POST",
        body: {
          periodoId: Number(grupoForm.periodoId),
          nivelId: Number(grupoForm.nivelId),
          turnoId: Number(grupoForm.turnoId),
          seccionId: Number(grupoForm.seccionId),
          codigo: grupoForm.codigo.trim(),
          capacidad: grupoForm.capacidad ? Number(grupoForm.capacidad) : undefined,
          estado: grupoForm.estado,
        },
      });
      setSuccess("¡Salón / Grupo aperturado exitosamente!");
      setModalType(null);
      await loadData();
    } catch (err) {
      setFormError(errorText(err));
    } finally {
      setFormBusy(false);
    }
  }

  async function handleCreateUnit(e: React.FormEvent) {
    e.preventDefault();
    setFormBusy(true);
    setFormError("");
    try {
      await api("oferta/unidades", {
        method: "POST",
        body: {
          nivelId: Number(selectedLevelId),
          codigo: unitForm.codigo.trim(),
          nombre: unitForm.nombre.trim(),
          creditos: unitForm.creditos ? unitForm.creditos : null,
          horasTeoricas: Number(unitForm.horasTeoricas) || 0,
          horasPracticas: Number(unitForm.horasPracticas) || 0,
          orden: Number(unitForm.orden) || 1,
          activo: unitForm.activo,
        },
      });
      setSuccess("¡Unidad didáctica agregada con éxito!");
      setModalType(null);
      await loadData();
    } catch (err) {
      setFormError(errorText(err));
    } finally {
      setFormBusy(false);
    }
  }

  async function handleCreateNivel(e: React.FormEvent) {
    e.preventDefault();
    setFormBusy(true);
    setFormError("");
    try {
      await api("oferta/niveles", {
        method: "POST",
        body: {
          idiomaId: Number(nivelForm.idiomaId),
          codigo: nivelForm.codigo.trim(),
          nombre: nivelForm.nombre.trim(),
          orden: Number(nivelForm.orden) || 1,
          duracionMeses: nivelForm.duracionMeses ? Number(nivelForm.duracionMeses) : null,
          activo: nivelForm.activo,
        },
      });
      setSuccess("¡Nivel / Programa creado exitosamente!");
      setModalType(null);
      await loadData();
    } catch (err) {
      setFormError(errorText(err));
    } finally {
      setFormBusy(false);
    }
  }

  async function handleUpdateEstado(e: React.FormEvent) {
    e.preventDefault();
    if (!statusModalGroup) return;
    setStatusBusy(true);
    setStatusError("");
    try {
      await api(`oferta/grupos/${statusModalGroup.id}`, {
        method: "PATCH",
        body: {
          estado: newEstado,
          motivo: estadoMotivo.trim() || "Actualización de estado del salón",
        },
      });
      setSuccess(`¡Estado del salón ${String(statusModalGroup.codigo)} actualizado a ${newEstado}!`);
      setStatusModalGroup(null);
      await loadData();
    } catch (err) {
      setStatusError(errorText(err));
    } finally {
      setStatusBusy(false);
    }
  }

  // Filtered grupos logic
  const filteredGrupos = grupos.filter((grp) => {
    // 1. Periodo filter
    if (filterPeriodo !== "all" && String(grp.periodo_id) !== String(filterPeriodo)) {
      return false;
    }
    // 2. Estado filter
    if (filterEstado !== "TODOS" && String(grp.estado).toUpperCase() !== filterEstado) {
      return false;
    }
    // 3. Search query
    if (searchSalon.trim()) {
      const q = searchSalon.toLowerCase();
      const cod = String(grp.codigo ?? "").toLowerCase();
      const ctx = grp.contexto as Record<string, string> | undefined;
      const nivelNom = String(ctx?.nivel ?? "").toLowerCase();
      const idiomaNom = String(ctx?.idioma ?? "").toLowerCase();
      if (!cod.includes(q) && !nivelNom.includes(q) && !idiomaNom.includes(q)) {
        return false;
      }
    }
    return true;
  });

  return (
    <div className="academic-container">
      {/* Header */}
      <div className="academic-header">
        <div>
          <h2>Gestión Académica</h2>
          <p>Supervisa programas, salones en ejecución y docentes del centro de idiomas.</p>
        </div>
        <div className="academic-info-banner">
          <BookOpen size={16} />
          <span>Estructura curricular y oferta de salones centralizada para Cusco.</span>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="feedback error" style={{ padding: "0.75rem", borderRadius: "0.5rem" }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}
      {success && (
        <div className="feedback success" style={{ padding: "0.75rem", borderRadius: "0.5rem" }}>
          <CheckCircle2 size={16} /> {success}
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="academic-tabs">
        <button
          className={`academic-tab-btn ${tab === "grupos" ? "active" : ""}`}
          onClick={() => setTab("grupos")}
        >
          <Clock size={16} /> Salones / Grupos ({grupos.length})
        </button>
        <button
          className={`academic-tab-btn ${tab === "programas" ? "active" : ""}`}
          onClick={() => setTab("programas")}
        >
          <BookOpen size={16} /> Programas y UDs ({niveles.length})
        </button>
        <button
          className={`academic-tab-btn ${tab === "docentes" ? "active" : ""}`}
          onClick={() => setTab("docentes")}
        >
          <Users size={16} /> Docentes ({docentes.length})
        </button>
      </div>

      {loading ? (
        <div style={{ padding: "3rem", textAlign: "center", color: "#64748b" }}>
          Cargando gestión académica…
        </div>
      ) : (
        <>
          {/* ── TAB 1: SALONES / GRUPOS ────────────────────────────────────────── */}
          {tab === "grupos" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {/* Barra de Filtros Inteligentes */}
              <div className="academic-filter-bar">
                <div className="academic-filter-group">
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <Calendar size={15} color="#007a3d" />
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#475569" }}>Periodo:</span>
                    <select
                      value={filterPeriodo}
                      onChange={(e) => setFilterPeriodo(e.target.value)}
                      className="input-field"
                      style={{ padding: "0.375rem 0.625rem", fontSize: "0.75rem", width: "auto" }}
                    >
                      <option value="all">Todos los periodos (Histórico)</option>
                      {periodos.map((p) => (
                        <option key={p.id} value={String(p.id)}>
                          {String(p.codigo)} — {String(p.nombre)} {p.estado === "ACTIVO" ? "(Vigente)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Estado Pills */}
                  <div style={{ display: "flex", gap: "0.25rem", marginLeft: "0.5rem" }}>
                    {(["ACTIVO", "PLANIFICADO", "CERRADO", "TODOS"] as const).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setFilterEstado(st)}
                        className={`academic-filter-pill ${filterEstado === st ? "active" : ""}`}
                      >
                        {st === "ACTIVO" && "● "}
                        {st === "TODOS" ? "Todos" : st.charAt(0) + st.slice(1).toLowerCase()}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Buscador instantáneo */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <Search size={15} color="#94a3b8" />
                  <input
                    type="text"
                    value={searchSalon}
                    onChange={(e) => setSearchSalon(e.target.value)}
                    placeholder="Buscar salón o idioma..."
                    className="input-field"
                    style={{ padding: "0.375rem 0.75rem", fontSize: "0.75rem", minWidth: "220px" }}
                  />
                </div>
              </div>

              {/* Grid de Tarjetas de Salones */}
              <div className="academic-grid">
                {filteredGrupos.map((grp) => {
                  const contexto = (grp.contexto as Record<string, string>) || {};
                  const turnoObj = turnos.find((t) => String(t.id) === String(grp.turno_id));
                  const nivelObj = niveles.find((n) => String(n.id) === String(grp.nivel_id));
                  const idiomaObj = idiomas.find((i) => String(i.id) === String(nivelObj?.idioma_id));
                  const matriculados = Number(grp.matriculados ?? 0);
                  const capacidad = Number(grp.capacidad ?? 25);
                  const porcentaje = Math.min(100, Math.round((matriculados / capacidad) * 100));

                  const estadoActual = String(grp.estado || "ACTIVO").toUpperCase();
                  const badgeClass =
                    estadoActual === "ACTIVO"
                      ? "badge-green"
                      : estadoActual === "PLANIFICADO"
                      ? "badge-blue"
                      : "badge-gray";

                  return (
                    <div key={grp.id} className="academic-card">
                      {/* Top badges */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                        <span className="academic-badge badge-green">
                          {String(contexto.turno || turnoObj?.nombre || "Turno general")}
                        </span>

                        {/* Interactive Status Badge */}
                        {admin ? (
                          <button
                            type="button"
                            onClick={() => {
                              setStatusModalGroup(grp);
                              setNewEstado(estadoActual as any);
                              setEstadoMotivo("");
                              setStatusError("");
                            }}
                            className={`academic-badge ${badgeClass} badge-interactive`}
                            title="Hacer clic para cambiar estado del salón"
                          >
                            <SlidersHorizontal size={10} style={{ marginRight: "3px" }} />
                            {estadoActual} ▾
                          </button>
                        ) : (
                          <span className={`academic-badge ${badgeClass}`}>
                            {estadoActual}
                          </span>
                        )}
                      </div>

                      {/* Title & Code */}
                      <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#1e293b", margin: "0 0 0.25rem 0" }}>
                        {idiomaObj?.nombre ? `${String(idiomaObj.nombre)} — ` : ""}
                        {String(contexto.nivel || nivelObj?.nombre || "Nivel")}
                      </h3>
                      <p style={{ fontFamily: "monospace", fontSize: "0.8125rem", color: "#64748b", margin: "0 0 0.75rem 0" }}>
                        {String(grp.codigo)}
                      </p>

                      {/* Details list */}
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.8125rem", color: "#475569" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <Clock size={14} color="#94a3b8" />
                          <span>
                            {turnoObj?.hora_inicio ? `${String(turnoObj.hora_inicio)} - ${String(turnoObj.hora_fin)}` : "Horario asignado"} · Sección {String(contexto.seccion || "A")}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <Calendar size={14} color="#94a3b8" />
                          <span>{String(contexto.periodo || "Periodo en curso")}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <GraduationCap size={14} color="#94a3b8" />
                          <span>
                            <strong>{matriculados}</strong> / {capacidad} estudiantes ({porcentaje}%)
                          </span>
                        </div>

                        {/* Progress bar */}
                        <div style={{ width: "100%", height: "6px", backgroundColor: "#e2e8f0", borderRadius: "9999px", overflow: "hidden", marginTop: "0.25rem" }}>
                          <div
                            style={{
                              width: `${porcentaje}%`,
                              height: "100%",
                              backgroundColor: porcentaje >= 90 ? "#e11d48" : "#007a3d",
                              borderRadius: "9999px",
                              transition: "width 0.3s ease",
                            }}
                          />
                        </div>
                      </div>

                      {/* Actions: Salón 360° */}
                      <div style={{ display: "flex", gap: "0.375rem", marginTop: "1rem" }}>
                        <a
                          href={`#/salones/${grp.id}?tab=nomina`}
                          className="academic-btn-action btn-action-primary"
                          style={{ flex: 1, padding: "0.35rem 0.5rem" }}
                          title="Ver nómina de alumnos matriculados"
                        >
                          👥 Alumnos
                        </a>
                        <a
                          href={`#/salones/${grp.id}?tab=asistencia`}
                          className="academic-btn-action btn-action-secondary"
                          style={{ flex: 1, padding: "0.35rem 0.5rem" }}
                          title="Tomar asistencia interactiva"
                        >
                          🕒 Asistencia
                        </a>
                        <a
                          href={`#/salones/${grp.id}?tab=calificaciones`}
                          className="academic-btn-action btn-action-secondary"
                          style={{ flex: 1, padding: "0.35rem 0.5rem" }}
                          title="Registrar calificaciones e indicadores"
                        >
                          📝 Notas
                        </a>
                      </div>
                    </div>
                  );
                })}

                {/* Empty State */}
                {filteredGrupos.length === 0 && (
                  <div className="academic-card" style={{ gridColumn: "1 / -1", padding: "3rem", textAlign: "center", color: "#64748b" }}>
                    <Calendar size={36} color="#cbd5e1" style={{ margin: "0 auto 0.75rem auto" }} />
                    <p style={{ fontWeight: 600, fontSize: "0.9375rem", margin: "0 0 0.25rem 0" }}>
                      No hay salones con el filtro seleccionado ({filterEstado.toLowerCase()})
                    </p>
                    <p style={{ fontSize: "0.8125rem", color: "#94a3b8", margin: "0 0 1rem 0" }}>
                      Intenta seleccionando &quot;Todos los periodos&quot; o cambiando el filtro de estado.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setFilterPeriodo("all");
                        setFilterEstado("TODOS");
                        setSearchSalon("");
                      }}
                      className="academic-btn-action btn-action-secondary"
                      style={{ margin: "0 auto" }}
                    >
                      Mostrar Todos los Salones
                    </button>
                  </div>
                )}

                {/* Dashed Add Card */}
                {admin && (
                  <button
                    type="button"
                    className="academic-btn-dashed"
                    onClick={() => setModalType("grupo")}
                  >
                    <Plus size={20} />
                    <span>Aperturar Nuevo Salón / Grupo</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── TAB 2: PROGRAMAS Y UDs ────────────────────────────────────────── */}
          {tab === "programas" && (
            <div className="academic-stack">
              {niveles.map((niv) => {
                const idioma = idiomas.find((i) => String(i.id) === String(niv.idioma_id));
                const uds = unidades.filter((u) => String(u.nivel_id) === String(niv.id));

                return (
                  <div key={niv.id} className="academic-card">
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem" }}>
                      <div
                        style={{
                          width: "3rem",
                          height: "3rem",
                          borderRadius: "1rem",
                          backgroundColor: "#f0faf4",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <BookOpen size={22} color="#007a3d" />
                      </div>

                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                          <h3 style={{ fontSize: "1.0625rem", fontWeight: 700, color: "#1e293b", margin: 0 }}>
                            {String(niv.nombre)}
                          </h3>
                          <span className="academic-badge badge-green">{String(niv.codigo)}</span>
                          {Boolean(idioma) && <span className="academic-badge badge-blue">{String(idioma?.nombre)}</span>}
                          {Boolean(niv.duracion_meses) && (
                            <span className="academic-badge badge-gray">{String(niv.duracion_meses)} meses</span>
                          )}
                        </div>

                        {/* Units list */}
                        <div style={{ marginTop: "0.75rem" }}>
                          <p style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: "0.5rem" }}>
                            Unidades Didácticas ({uds.length})
                          </p>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                            {uds.map((ud) => (
                              <div key={ud.id} className="academic-unit-chip">
                                <strong>{String(ud.codigo)}</strong>
                                <ChevronRight size={12} color="#94a3b8" />
                                <span>{String(ud.nombre)}</span>
                                {Boolean(ud.creditos) && (
                                  <span style={{ color: "#94a3b8", fontSize: "0.6875rem" }}>
                                    ({String(ud.creditos)} cr)
                                  </span>
                                )}
                              </div>
                            ))}

                            {admin && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedLevelId(String(niv.id));
                                  setModalType("unidad");
                                }}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "0.25rem",
                                  padding: "0.375rem 0.625rem",
                                  borderRadius: "0.5rem",
                                  border: "1px dashed #cbd5e1",
                                  background: "#ffffff",
                                  color: "#007a3d",
                                  fontSize: "0.75rem",
                                  fontWeight: 600,
                                  cursor: "pointer",
                                }}
                              >
                                <Plus size={12} /> Agregar UD
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Dashed Add Program */}
              {admin && (
                <button
                  type="button"
                  className="academic-btn-dashed"
                  onClick={() => setModalType("nivel")}
                >
                  <Plus size={20} />
                  <span>Agregar Nuevo Nivel / Programa</span>
                </button>
              )}
            </div>
          )}

          {/* ── TAB 3: DOCENTES ──────────────────────────────────────────────── */}
          {tab === "docentes" && (
            <div className="academic-grid">
              {docentes.map((doc) => {
                const nombreCompleto = `${doc.nombres ? String(doc.nombres) : ""} ${doc.apellido_paterno ? String(doc.apellido_paterno) : ""} ${doc.apellido_materno ? String(doc.apellido_materno) : ""}`.trim() || String(doc.codigo_docente);
                const inicial = nombreCompleto.charAt(0).toUpperCase() || "D";
                return (
                  <div key={doc.id} className="academic-card" style={{ display: "flex", alignItems: "flex-start", gap: "1rem" }}>
                    <div className="academic-avatar">{inicial}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                        <h3 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "#1e293b", margin: 0, wordBreak: "break-word" }}>
                          {nombreCompleto}
                        </h3>
                        <span className="academic-badge badge-blue">
                          {doc.especialidad ? String(doc.especialidad) : "Idiomas"}
                        </span>
                      </div>
                      <p style={{ fontSize: "0.8125rem", color: "#64748b", margin: "0.25rem 0 0 0" }}>
                        {doc.correo ? String(doc.correo) : "Sin correo registrado"}
                      </p>
                      <p style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "#94a3b8", margin: "0.25rem 0 0 0" }}>
                        Código: {String(doc.codigo_docente)}
                      </p>
                    </div>
                  </div>
                );
              })}

              {docentes.length === 0 && (
                <div style={{ gridColumn: "1 / -1", padding: "2rem", textAlign: "center", color: "#64748b" }}>
                  No se encontraron docentes registrados o disponibles para tu rol.
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── MODAL: CAMBIAR ESTADO DEL SALÓN ───────────────────────────────────── */}
      {statusModalGroup && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 110, padding: "1rem" }}>
          <div className="academic-card" style={{ width: "100%", maxWidth: "440px", padding: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.0625rem", fontWeight: 700 }}>Cambiar Estado del Salón</h3>
                <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.75rem", color: "#64748b" }}>
                  {String(statusModalGroup.codigo)}
                </p>
              </div>
              <button onClick={() => setStatusModalGroup(null)} style={{ background: "none", border: "none", cursor: "pointer" }}>
                <X size={20} />
              </button>
            </div>

            {statusError && (
              <div className="feedback error" style={{ marginBottom: "1rem", padding: "0.5rem" }}>
                {statusError}
              </div>
            )}

            <form onSubmit={handleUpdateEstado} style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
              <div>
                <label className="label">Seleccionar Nuevo Estado</label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.5rem" }}>
                  {(["PLANIFICADO", "ACTIVO", "CERRADO"] as const).map((est) => (
                    <button
                      key={est}
                      type="button"
                      onClick={() => setNewEstado(est)}
                      className={`academic-filter-pill ${newEstado === est ? "active" : ""}`}
                      style={{ textAlign: "center", padding: "0.5rem" }}
                    >
                      {est}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="label">Motivo del Cambio</label>
                <input
                  type="text"
                  value={estadoMotivo}
                  onChange={(e) => setEstadoMotivo(e.target.value)}
                  placeholder="Ej: Inicio de clases del ciclo o Cierre académico"
                  className="input-field"
                  required
                />
              </div>

              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => setStatusModalGroup(null)}
                  className="academic-btn-action btn-action-secondary"
                  style={{ flex: 1 }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={statusBusy}
                  className="academic-btn-action btn-action-primary"
                  style={{ flex: 1 }}
                >
                  {statusBusy ? "Guardando…" : "Actualizar Estado"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODALES DE CREACIÓN RÁPIDA ────────────────────────────────────────── */}

      {/* Modal: Aperturar Salón / Grupo */}
      {modalType === "grupo" && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: "1rem" }}>
          <div className="academic-card" style={{ width: "100%", maxWidth: "500px", padding: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 700 }}>Aperturar Salón de Clase</h3>
              <button onClick={() => setModalType(null)} style={{ background: "none", border: "none", cursor: "pointer" }}>
                <X size={20} />
              </button>
            </div>

            {formError && (
              <div className="feedback error" style={{ marginBottom: "1rem", padding: "0.5rem" }}>
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateGrupo} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div>
                <label className="label">Periodo Académico</label>
                <select
                  value={grupoForm.periodoId}
                  onChange={(e) => setGrupoForm({ ...grupoForm, periodoId: e.target.value })}
                  className="input-field"
                  required
                >
                  {periodos.map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      {String(p.codigo)} — {String(p.nombre)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Nivel / Programa</label>
                <select
                  value={grupoForm.nivelId}
                  onChange={(e) => setGrupoForm({ ...grupoForm, nivelId: e.target.value })}
                  className="input-field"
                  required
                >
                  {niveles.map((n) => (
                    <option key={n.id} value={String(n.id)}>
                      {String(n.codigo)} — {String(n.nombre)}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                <div>
                  <label className="label">Turno</label>
                  <select
                    value={grupoForm.turnoId}
                    onChange={(e) => setGrupoForm({ ...grupoForm, turnoId: e.target.value })}
                    className="input-field"
                    required
                  >
                    {turnos.map((t) => (
                      <option key={t.id} value={String(t.id)}>
                        {String(t.nombre)} ({String(t.hora_inicio)}-{String(t.hora_fin)})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Sección</label>
                  <select
                    value={grupoForm.seccionId}
                    onChange={(e) => setGrupoForm({ ...grupoForm, seccionId: e.target.value })}
                    className="input-field"
                    required
                  >
                    {secciones.map((s) => (
                      <option key={s.id} value={String(s.id)}>
                        {String(s.nombre)} ({String(s.codigo)})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                <div>
                  <label className="label">Código Salón</label>
                  <input
                    type="text"
                    value={grupoForm.codigo}
                    onChange={(e) => setGrupoForm({ ...grupoForm, codigo: e.target.value })}
                    placeholder="ING-BAS-M1-A"
                    className="input-field"
                    required
                  />
                </div>
                <div>
                  <label className="label">Capacidad Máx.</label>
                  <input
                    type="number"
                    value={grupoForm.capacidad}
                    onChange={(e) => setGrupoForm({ ...grupoForm, capacidad: e.target.value })}
                    className="input-field"
                    min="1"
                    required
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
                <button type="button" onClick={() => setModalType(null)} className="academic-btn-action btn-action-secondary" style={{ flex: 1 }}>
                  Cancelar
                </button>
                <button type="submit" disabled={formBusy} className="academic-btn-action btn-action-primary" style={{ flex: 1 }}>
                  {formBusy ? "Aperturando…" : "Aperturar Salón"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Agregar Unidad Didáctica */}
      {modalType === "unidad" && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: "1rem" }}>
          <div className="academic-card" style={{ width: "100%", maxWidth: "460px", padding: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 700 }}>Agregar Unidad Didáctica</h3>
              <button onClick={() => setModalType(null)} style={{ background: "none", border: "none", cursor: "pointer" }}>
                <X size={20} />
              </button>
            </div>

            {formError && (
              <div className="feedback error" style={{ marginBottom: "1rem", padding: "0.5rem" }}>
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateUnit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div>
                <label className="label">Código de UD</label>
                <input
                  type="text"
                  value={unitForm.codigo}
                  onChange={(e) => setUnitForm({ ...unitForm, codigo: e.target.value })}
                  placeholder="UD01"
                  className="input-field"
                  required
                />
              </div>

              <div>
                <label className="label">Nombre de la Unidad</label>
                <input
                  type="text"
                  value={unitForm.nombre}
                  onChange={(e) => setUnitForm({ ...unitForm, nombre: e.target.value })}
                  placeholder="Comunicación Interpersonal Básica"
                  className="input-field"
                  required
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem" }}>
                <div>
                  <label className="label">Créditos</label>
                  <input
                    type="text"
                    value={unitForm.creditos}
                    onChange={(e) => setUnitForm({ ...unitForm, creditos: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="label">Horas Teór.</label>
                  <input
                    type="number"
                    value={unitForm.horasTeoricas}
                    onChange={(e) => setUnitForm({ ...unitForm, horasTeoricas: e.target.value })}
                    className="input-field"
                    required
                  />
                </div>
                <div>
                  <label className="label">Horas Práct.</label>
                  <input
                    type="number"
                    value={unitForm.horasPracticas}
                    onChange={(e) => setUnitForm({ ...unitForm, horasPracticas: e.target.value })}
                    className="input-field"
                    required
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
                <button type="button" onClick={() => setModalType(null)} className="academic-btn-action btn-action-secondary" style={{ flex: 1 }}>
                  Cancelar
                </button>
                <button type="submit" disabled={formBusy} className="academic-btn-action btn-action-primary" style={{ flex: 1 }}>
                  {formBusy ? "Guardando…" : "Guardar Unidad"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Agregar Nivel / Programa */}
      {modalType === "nivel" && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: "1rem" }}>
          <div className="academic-card" style={{ width: "100%", maxWidth: "460px", padding: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 700 }}>Agregar Nivel o Programa</h3>
              <button onClick={() => setModalType(null)} style={{ background: "none", border: "none", cursor: "pointer" }}>
                <X size={20} />
              </button>
            </div>

            {formError && (
              <div className="feedback error" style={{ marginBottom: "1rem", padding: "0.5rem" }}>
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateNivel} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div>
                <label className="label">Idioma</label>
                <select
                  value={nivelForm.idiomaId}
                  onChange={(e) => setNivelForm({ ...nivelForm, idiomaId: e.target.value })}
                  className="input-field"
                  required
                >
                  {idiomas.map((i) => (
                    <option key={i.id} value={String(i.id)}>
                      {String(i.nombre)} ({String(i.codigo)})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                <div>
                  <label className="label">Código</label>
                  <input
                    type="text"
                    value={nivelForm.codigo}
                    onChange={(e) => setNivelForm({ ...nivelForm, codigo: e.target.value })}
                    placeholder="ING-BAS-1"
                    className="input-field"
                    required
                  />
                </div>
                <div>
                  <label className="label">Meses</label>
                  <input
                    type="number"
                    value={nivelForm.duracionMeses}
                    onChange={(e) => setNivelForm({ ...nivelForm, duracionMeses: e.target.value })}
                    className="input-field"
                    min="1"
                  />
                </div>
              </div>

              <div>
                <label className="label">Nombre del Nivel / Programa</label>
                <input
                  type="text"
                  value={nivelForm.nombre}
                  onChange={(e) => setNivelForm({ ...nivelForm, nombre: e.target.value })}
                  placeholder="Inglés Básico 1"
                  className="input-field"
                  required
                />
              </div>

              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
                <button type="button" onClick={() => setModalType(null)} className="academic-btn-action btn-action-secondary" style={{ flex: 1 }}>
                  Cancelar
                </button>
                <button type="submit" disabled={formBusy} className="academic-btn-action btn-action-primary" style={{ flex: 1 }}>
                  {formBusy ? "Guardando…" : "Guardar Nivel"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
