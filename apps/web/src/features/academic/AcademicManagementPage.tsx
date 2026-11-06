import { useCallback, useEffect, useState } from "react";
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
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { allRows, api, errorText, type Row } from "../../shared/api";
import { useAuth } from "../auth/session";
import { RecordForm } from "../configuration/RecordForm";
import { resources } from "../configuration/model";
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

  // Filtros de salones
  const [filterPeriodo, setFilterPeriodo] = useState<string>("all");
  const [filterEstado, setFilterEstado] = useState<"ACTIVO" | "PLANIFICADO" | "CERRADO" | "TODOS">("TODOS");
  const [searchSalon, setSearchSalon] = useState<string>("");

  const [editor, setEditor] = useState<{
    key: "grupos" | "unidades" | "niveles";
    row?: Row;
    initial?: Row;
  }>();

  const loadData = useCallback((signal?: AbortSignal) =>
    Promise.all([
        allRows("oferta/idiomas", signal),
        allRows("oferta/niveles", signal),
        allRows("oferta/unidades", signal),
        allRows("oferta/grupos", signal),
        allRows("oferta/turnos", signal),
        allRows("oferta/secciones", signal),
        allRows("oferta/periodos", signal),
        admin ? allRows("docentes", signal) : Promise.resolve([]),
    ])
      .then(([idms, nivs, unds, grps, trns, secs, perds, docs]) => {
        if (signal?.aborted) return;
        setIdiomas(idms);
        setNiveles(nivs);
        setUnidades(unds);
        setGrupos(grps);
        setTurnos(trns);
        setSecciones(secs);
        setPeriodos(perds);
        setDocentes(docs);
        setError("");
      })
      .catch((err: unknown) => {
        if (!signal?.aborted) setError(errorText(err));
      })
      .finally(() => {
        if (!signal?.aborted) setLoading(false);
      }),
    [admin],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadData(controller.signal);
    return () => controller.abort();
  }, [loadData]);

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
        {admin && (
          <button
            className={`academic-tab-btn ${tab === "docentes" ? "active" : ""}`}
            onClick={() => setTab("docentes")}
          >
            <Users size={16} /> Docentes ({docentes.length})
          </button>
        )}
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
                          {String(p.codigo)} — {String(p.nombre)} {p.estado === "ABIERTO" ? "(Abierto)" : ""}
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
                  const capacidad = grp.capacidad == null ? null : Number(grp.capacidad);
                  const porcentaje = capacidad
                    ? Math.min(100, Math.round((matriculados / capacidad) * 100))
                    : null;

                  const estadoActual = String(grp.estado ?? "Sin estado").toUpperCase();
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
                            onClick={() => setEditor({ key: "grupos", row: grp })}
                            className={`academic-badge ${badgeClass} badge-interactive`}
                            title="Editar grupo y su estado"
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
                            {turnoObj?.hora_inicio ? `${String(turnoObj.hora_inicio)} - ${String(turnoObj.hora_fin)}` : "Horario sin indicar"} · Sección {contexto.seccion || "sin indicar"}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <Calendar size={14} color="#94a3b8" />
                          <span>{String(contexto.periodo || "Periodo sin indicar")}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <GraduationCap size={14} color="#94a3b8" />
                          <span>
                            <strong>{matriculados}</strong> estudiantes{capacidad === null
                              ? " · Capacidad sin indicar"
                              : ` / ${capacidad} (${porcentaje}%)`}
                          </span>
                        </div>

                        {porcentaje !== null && (
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
                        )}
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
                          title="Ver asistencia"
                        >
                          🕒 Asistencia
                        </a>
                        <a
                          href={`#/salones/${grp.id}?tab=calificaciones`}
                          className="academic-btn-action btn-action-secondary"
                          style={{ flex: 1, padding: "0.35rem 0.5rem" }}
                          title="Ver calificaciones"
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
                    onClick={() => setEditor({
                      key: "grupos",
                      initial: filterPeriodo === "all"
                        ? undefined
                        : { id: "", periodo_id: filterPeriodo },
                    })}
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
                                {ud.creditos != null && (
                                  <span style={{ color: "#94a3b8", fontSize: "0.6875rem" }}>
                                    ({String(ud.creditos)} cr)
                                  </span>
                                )}
                              </div>
                            ))}

                            {admin && (
                              <button
                                type="button"
                                onClick={() => setEditor({
                                  key: "unidades",
                                  initial: { id: "", nivel_id: String(niv.id) },
                                })}
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
                  onClick={() => setEditor({ key: "niveles" })}
                >
                  <Plus size={20} />
                  <span>Agregar Nuevo Nivel / Programa</span>
                </button>
              )}
            </div>
          )}

          {/* ── TAB 3: DOCENTES ──────────────────────────────────────────────── */}
          {admin && tab === "docentes" && (
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

      {admin && editor && (
        <RecordForm
          resource={resources[editor.key]!}
          row={editor.row}
          initial={editor.initial}
          lookups={{ idiomas, niveles, turnos, secciones, periodos }}
          onClose={() => setEditor(undefined)}
          onSave={async (body) => {
            const path = resources[editor.key]!.path;
            await api(editor.row ? `${path}/${editor.row.id}` : path, {
              method: editor.row ? "PATCH" : "POST",
              body,
            });
            setEditor(undefined);
            setSuccess("Cambios guardados.");
            setLoading(true);
            await loadData();
          }}
        />
      )}
    </div>
  );
}
