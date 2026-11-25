import { useCallback, useEffect, useMemo, useState } from "react";
import { api, errorText } from "../../shared/api";
import "./audit.css";

export interface AuditModificationItem {
  id: string;
  usuario_id: string | null;
  nombre_usuario: string | null;
  usuario_nombre_completo: string | null;
  usuario_roles: string[];
  accion: string;
  entidad: string;
  entidad_id: string;
  valor_anterior: Record<string, unknown>;
  valor_nuevo: Record<string, unknown>;
  motivo: string | null;
  ip_origen: string | null;
  ocurrido_at: string;
  revertido: boolean;
  revertido_at: string | null;
  revertido_por: string | null;
  revertido_motivo: string | null;
}

interface AuditListResponse {
  items: AuditModificationItem[];
  total: number;
}

interface FieldDiff {
  key: string;
  label: string;
  oldVal: string;
  newVal: string;
  changed: boolean;
}

const ENTITY_LABELS: Record<string, string> = {
  calificaciones: "Calificaciones",
  asistencias: "Asistencias",
  estudiantes: "Estudiantes",
  personas: "Datos de Persona",
  matriculas: "Matrículas",
  vouchers: "Vouchers de Pago",
  docentes: "Docentes",
  grupos: "Grupos / Salones",
  grupo_docentes: "Asignación Docente",
  sesiones_clase: "Sesiones de Clase",
  periodos_academicos: "Periodos Académicos",
  idiomas: "Idiomas",
  niveles: "Niveles",
  unidades_didacticas: "Unidades Didácticas",
  turnos: "Turnos",
  secciones: "Secciones",
  usuarios: "Usuarios y Roles",
};

const ACTION_LABELS: Record<string, string> = {
  UPDATE: "Edición de registro",
  UPDATE_GRADE: "Modificación de nota",
  INACTIVATE: "Inactivación de estado",
  ACTIVATE: "Activación de matrícula",
  CORRECT_AFTER_CLOSE: "Corrección post-cierre",
  VALIDATE: "Validación de voucher",
  REJECT: "Rechazo de voucher",
  ROLES_CHANGED: "Cambio de permisos/roles",
  REALIZE: "Cambio de estado de sesión",
  ASSIGN: "Actualización de asignación",
};

const FIELD_LABELS: Record<string, string> = {
  nota: "Nota vigesimal",
  codigo: "Código / Asistencia",
  observacion: "Observación",
  estado: "Estado",
  activo: "Activo",
  telefono: "Teléfono",
  correo: "Correo electrónico",
  direccion: "Dirección",
  nombres: "Nombres",
  apellido_paterno: "Apellido paterno",
  apellidoPaterno: "Apellido paterno",
  apellido_materno: "Apellido materno",
  apellidoMaterno: "Apellido materno",
  numero_documento: "N.° Documento",
  numeroDocumento: "N.° Documento",
  codigo_estudiante: "Código Estudiante",
  codigo_docente: "Código Docente",
  especialidad: "Especialidad",
  grupo_id: "ID de Salón/Grupo",
  voucher_id: "ID de Voucher",
  capacidad: "Capacidad de aula",
  importe: "Importe (S/)",
  numero: "N.° Operación",
  roles: "Roles asignados",
  es_titular: "Docente titular",
  nombre_usuario: "Usuario",
};

const IGNORED_DIFF_KEYS = new Set([
  "id",
  "persona_id",
  "version",
  "actualizado_at",
  "creado_at",
  "validado_at",
  "contexto",
  "_reverted_event_id",
]);

function flattenSnapshot(
  obj: Record<string, unknown> | null | undefined,
  prefix = "",
): Record<string, string> {
  const result: Record<string, string> = {};
  if (!obj || typeof obj !== "object") return result;

  for (const [key, value] of Object.entries(obj)) {
    if (IGNORED_DIFF_KEYS.has(key)) continue;
    const pathKey = prefix ? `${prefix}.${key}` : key;
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      if (key === "contexto") continue;
      Object.assign(
        result,
        flattenSnapshot(value as Record<string, unknown>, pathKey),
      );
    } else if (Array.isArray(value)) {
      result[pathKey] = value.join(", ");
    } else if (typeof value === "boolean") {
      result[pathKey] = value ? "Sí (Activo)" : "No (Inactivo)";
    } else if (value === null || value === undefined || value === "") {
      result[pathKey] = "—";
    } else {
      result[pathKey] = String(value);
    }
  }
  return result;
}

function computeFieldDiffs(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): FieldDiff[] {
  const flatBefore = flattenSnapshot(before);
  const flatAfter = flattenSnapshot(after);
  const allKeys = Array.from(
    new Set([...Object.keys(flatBefore), ...Object.keys(flatAfter)]),
  );

  const diffs: FieldDiff[] = [];
  for (const key of allKeys) {
    const oldVal = flatBefore[key] ?? "—";
    const newVal = flatAfter[key] ?? "—";
    const rawKey = key.includes(".") ? key.split(".").pop()! : key;
    const label = FIELD_LABELS[rawKey] ?? key;
    diffs.push({
      key,
      label,
      oldVal,
      newVal,
      changed: oldVal !== newVal,
    });
  }

  return diffs.sort((a, b) => Number(b.changed) - Number(a.changed));
}

function formatDateParts(iso: string): { date: string; time: string } {
  try {
    const d = new Date(iso);
    return {
      date: d.toLocaleDateString("es-PE", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
      time: d.toLocaleTimeString("es-PE", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
    };
  } catch {
    return { date: iso, time: "" };
  }
}

function actorInitials(item: AuditModificationItem): string {
  const source = item.usuario_nombre_completo || item.nombre_usuario || "SI";
  const parts = source.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

const REVERT_PRESETS = [
  "Modificación no autorizada detectada en revisión de seguridad",
  "Error de digitación reportado por secretaría académica",
  "Restauración de registro solicitada por Dirección",
];

export function AuditLogsPage() {
  const [items, setItems] = useState<AuditModificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");

  // Filters
  const [entidadFilter, setEntidadFilter] = useState("TODAS");
  const [estadoFilter, setEstadoFilter] = useState<
    "TODOS" | "PENDIENTES" | "REVERTIDOS"
  >("TODOS");
  const [searchQuery, setSearchQuery] = useState("");

  // Modal state
  const [selectedItem, setSelectedItem] =
    useState<AuditModificationItem | null>(null);
  const [showRawJson, setShowRawJson] = useState(false);
  const [revertMotivo, setRevertMotivo] = useState("");
  const [reverting, setReverting] = useState(false);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api<AuditListResponse>(
        "auditoria?limit=200",
      );
      setItems(response.items ?? []);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    api<AuditListResponse>("auditoria?limit=200")
      .then((response) => {
        if (active) setItems(response.items ?? []);
      })
      .catch((err: unknown) => {
        if (active) setError(errorText(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const diffsByEventId = useMemo(() => {
    const map = new Map<string, FieldDiff[]>();
    for (const item of items) {
      map.set(
        item.id,
        computeFieldDiffs(item.valor_anterior, item.valor_nuevo),
      );
    }
    return map;
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      if (entidadFilter !== "TODAS" && item.entidad !== entidadFilter) {
        return false;
      }
      if (estadoFilter === "PENDIENTES" && item.revertido) {
        return false;
      }
      if (estadoFilter === "REVERTIDOS" && !item.revertido) {
        return false;
      }
      if (!q) return true;

      const diffs = diffsByEventId.get(item.id) ?? [];
      const diffText = diffs
        .filter((d) => d.changed)
        .map((d) => `${d.label} ${d.oldVal} ${d.newVal}`)
        .join(" ")
        .toLowerCase();

      const haystack = [
        item.id,
        item.nombre_usuario ?? "",
        item.usuario_nombre_completo ?? "",
        item.entidad,
        ENTITY_LABELS[item.entidad] ?? "",
        ACTION_LABELS[item.accion] ?? item.accion,
        item.entidad_id,
        item.motivo ?? "",
        diffText,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [items, entidadFilter, estadoFilter, searchQuery, diffsByEventId]);

  const kpis = useMemo(() => {
    const total = items.length;
    const reverted = items.filter((i) => i.revertido).length;
    const active = total - reverted;
    const uniqueModules = new Set(items.map((i) => i.entidad)).size;
    return { total, active, reverted, uniqueModules };
  }, [items]);

  const availableEntities = useMemo(() => {
    const set = new Set<string>(items.map((i) => i.entidad));
    return Array.from(set).sort();
  }, [items]);

  const handleOpenInspector = (item: AuditModificationItem) => {
    setSelectedItem(item);
    setRevertMotivo("");
    setShowRawJson(false);
  };

  const handleRevert = async () => {
    if (!selectedItem || selectedItem.revertido) return;
    setReverting(true);
    setError("");
    setFeedback("");
    try {
      const reason =
        revertMotivo.trim() ||
        `Reversión ejecutada desde el Centro de Seguridad (Evento #${selectedItem.id})`;
      await api(`auditoria/${selectedItem.id}/revertir`, {
        method: "POST",
        body: { motivo: reason },
      });
      setFeedback(
        `Se revirtió con éxito la modificación #${selectedItem.id} (${ENTITY_LABELS[selectedItem.entidad] ?? selectedItem.entidad} · Registro #${selectedItem.entidad_id}) a sus datos anteriores.`,
      );
      setSelectedItem(null);
      await loadLogs();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setReverting(false);
    }
  };

  const selectedDiffs = useMemo(() => {
    if (!selectedItem) return [];
    return diffsByEventId.get(selectedItem.id) ?? [];
  }, [selectedItem, diffsByEventId]);

  return (
    <div className="audit-page">
      {/* Executive Security Hero Header */}
      <header className="audit-hero">
        <div className="audit-hero-left">
          <div className="audit-hero-icon" aria-hidden="true">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </div>
          <div>
            <div className="audit-hero-title-row">
              <h2>Centro de Seguridad y Auditoría de Modificaciones</h2>
              <span className="audit-security-pill">
                Trazabilidad Inmutable · Rollback Activo
              </span>
            </div>
            <p>
              Supervisa únicamente las modificaciones de datos realizadas en el
              sistema (excluyendo altas nuevas e inicios de sesión), identifica
              qué usuario efectuó cada cambio, compara el valor anterior frente
              al actual y revierte cualquier alteración no autorizada.
            </p>
          </div>
        </div>
        <div className="audit-hero-actions">
          <button
            type="button"
            className="audit-refresh-btn"
            onClick={() => void loadLogs()}
            disabled={loading}
          >
            <span aria-hidden="true">↻</span>
            {loading ? "Sincronizando..." : "Actualizar bitácora"}
          </button>
        </div>
      </header>

      {/* KPI Cards */}
      <section className="audit-kpi-grid" aria-label="Indicadores de auditoría">
        <div className="audit-kpi-card">
          <div className="audit-kpi-info">
            <span className="audit-kpi-label">Modificaciones Registradas</span>
            <span className="audit-kpi-value">{kpis.total}</span>
            <span className="audit-kpi-sub">
              Con snapshot anterior y actual
            </span>
          </div>
          <div className="audit-kpi-badge emerald">Δ</div>
        </div>

        <div className="audit-kpi-card">
          <div className="audit-kpi-info">
            <span className="audit-kpi-label">Cambios Vigentes (Reversibles)</span>
            <span className="audit-kpi-value">{kpis.active}</span>
            <span className="audit-kpi-sub">
              Listos para inspección o rollback
            </span>
          </div>
          <div className="audit-kpi-badge amber">↺</div>
        </div>

        <div className="audit-kpi-card">
          <div className="audit-kpi-info">
            <span className="audit-kpi-label">Modificaciones Revertidas</span>
            <span className="audit-kpi-value">{kpis.reverted}</span>
            <span className="audit-kpi-sub">
              Restauradas a su valor original
            </span>
          </div>
          <div className="audit-kpi-badge indigo">✓</div>
        </div>

        <div className="audit-kpi-card">
          <div className="audit-kpi-info">
            <span className="audit-kpi-label">Módulos con Actividad</span>
            <span className="audit-kpi-value">{kpis.uniqueModules}</span>
            <span className="audit-kpi-sub">
              Tablas críticas monitoreadas
            </span>
          </div>
          <div className="audit-kpi-badge slate">⚙</div>
        </div>
      </section>

      {/* Feedback & Error Banners */}
      {feedback && (
        <div className="audit-feedback-banner success" role="status">
          <span>✓ {feedback}</span>
          <button
            type="button"
            className="audit-btn-inspect"
            onClick={() => setFeedback("")}
          >
            Cerrar
          </button>
        </div>
      )}

      {error && (
        <div className="audit-feedback-banner error" role="alert">
          <span>⚠ {error}</span>
          <button
            type="button"
            className="audit-btn-inspect"
            onClick={() => setError("")}
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Filter Toolbar */}
      <section className="audit-toolbar" aria-label="Filtros de búsqueda">
        <div className="audit-toolbar-left">
          <div className="audit-search-box">
            <input
              type="search"
              className="audit-search-input"
              placeholder="Buscar por usuario, módulo, valor anterior/nuevo o motivo..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <select
            className="audit-select"
            aria-label="Filtrar por módulo"
            value={entidadFilter}
            onChange={(e) => setEntidadFilter(e.target.value)}
          >
            <option value="TODAS">Todos los módulos ({items.length})</option>
            {availableEntities.map((ent) => (
              <option key={ent} value={ent}>
                {ENTITY_LABELS[ent] ?? ent}
              </option>
            ))}
          </select>
        </div>

        <div className="audit-segment-group" role="group" aria-label="Estado de modificación">
          <button
            type="button"
            className={`audit-segment-btn ${estadoFilter === "TODOS" ? "active" : ""}`}
            onClick={() => setEstadoFilter("TODOS")}
          >
            Todos ({kpis.total})
          </button>
          <button
            type="button"
            className={`audit-segment-btn ${estadoFilter === "PENDIENTES" ? "active" : ""}`}
            onClick={() => setEstadoFilter("PENDIENTES")}
          >
            Vigentes ({kpis.active})
          </button>
          <button
            type="button"
            className={`audit-segment-btn ${estadoFilter === "REVERTIDOS" ? "active" : ""}`}
            onClick={() => setEstadoFilter("REVERTIDOS")}
          >
            Revertidos ({kpis.reverted})
          </button>
        </div>
      </section>

      {/* Main Modifications Table */}
      <section className="audit-table-card">
        {loading ? (
          <div className="audit-empty-state">
            Cargando bitácora de modificaciones verificadas...
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="audit-empty-state">
            <strong>No se encontraron modificaciones con los filtros seleccionados.</strong>
            <p style={{ marginTop: "0.35rem", fontSize: "0.83rem" }}>
              Recuerda que este panel filtra exclusivamente cambios sobre registros existentes
              (donde existe un valor anterior y un valor nuevo).
            </p>
          </div>
        ) : (
          <div className="audit-table-scroll">
            <table className="audit-table">
              <thead>
                <tr>
                  <th>Evento / Fecha</th>
                  <th>Usuario Responsable</th>
                  <th>Módulo y Acción</th>
                  <th>Cambios Detectados (Antes → Ahora)</th>
                  <th>Estado</th>
                  <th>Acciones de Seguridad</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const { date, time } = formatDateParts(item.ocurrido_at);
                  const allDiffs = diffsByEventId.get(item.id) ?? [];
                  const changedDiffs = allDiffs.filter((d) => d.changed);
                  const visibleDiffs =
                    changedDiffs.length > 0
                      ? changedDiffs.slice(0, 3)
                      : allDiffs.slice(0, 2);

                  return (
                    <tr
                      key={item.id}
                      className={item.revertido ? "row-reverted" : ""}
                    >
                      <td>
                        <div className="audit-event-cell">
                          <span className="audit-event-id">#{item.id}</span>
                          <span className="audit-event-date">{date}</span>
                          <span className="audit-event-time">{time}</span>
                        </div>
                      </td>

                      <td>
                        <div className="audit-actor-cell">
                          <div className="audit-actor-avatar">
                            {actorInitials(item)}
                          </div>
                          <div className="audit-actor-details">
                            <span className="audit-actor-name">
                              {item.usuario_nombre_completo ||
                                item.nombre_usuario ||
                                "Sistema Institucional"}
                            </span>
                            <div className="audit-actor-meta">
                              <span>@{item.nombre_usuario ?? "sistema"}</span>
                              {item.usuario_roles.map((r) => (
                                <span
                                  key={r}
                                  className={`audit-role-chip ${r}`}
                                >
                                  {r}
                                </span>
                              ))}
                              {item.ip_origen && (
                                <span title="Dirección IP de origen">
                                  · IP {item.ip_origen}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td>
                        <div className="audit-entity-wrap">
                          <span
                            className={`audit-entity-badge ${item.entidad}`}
                          >
                            {ENTITY_LABELS[item.entidad] ?? item.entidad}
                          </span>
                          <span className="audit-entity-sub">
                            {ACTION_LABELS[item.accion] ?? item.accion} · ID #
                            {item.entidad_id}
                          </span>
                          {item.motivo && (
                            <span
                              className="audit-entity-sub"
                              style={{ color: "#334155", fontStyle: "italic" }}
                            >
                              «{item.motivo}»
                            </span>
                          )}
                        </div>
                      </td>

                      <td>
                        <div className="audit-diff-preview-list">
                          {visibleDiffs.map((d) => (
                            <div key={d.key} className="audit-diff-chip">
                              <span className="audit-diff-key">{d.label}:</span>
                              <span className="audit-diff-old">{d.oldVal}</span>
                              <span className="audit-diff-arrow">→</span>
                              <span className="audit-diff-new">{d.newVal}</span>
                            </div>
                          ))}
                          {changedDiffs.length > 3 && (
                            <span className="audit-diff-more">
                              + {changedDiffs.length - 3} campo(s) modificado(s)
                              adicional(es)
                            </span>
                          )}
                        </div>
                      </td>

                      <td>
                        {item.revertido ? (
                          <div>
                            <span className="audit-status-pill reverted">
                              ✓ Revertido
                            </span>
                            <div className="audit-reverted-meta">
                              Por @{item.revertido_por ?? "admin"}
                              {item.revertido_at
                                ? ` · ${formatDateParts(item.revertido_at).date}`
                                : ""}
                            </div>
                          </div>
                        ) : (
                          <span className="audit-status-pill active">
                            ● Vigente · Reversible
                          </span>
                        )}
                      </td>

                      <td>
                        <div className="audit-row-actions">
                          <button
                            type="button"
                            className="audit-btn-inspect"
                            onClick={() => handleOpenInspector(item)}
                          >
                            Ver antes / actual
                          </button>
                          {!item.revertido && (
                            <button
                              type="button"
                              className="audit-btn-revert"
                              onClick={() => handleOpenInspector(item)}
                            >
                              ↺ Revertir
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Side-by-Side Diff & Rollback Modal */}
      {selectedItem && (
        <div
          className="audit-modal-backdrop"
          onClick={() => setSelectedItem(null)}
        >
          <div
            className="audit-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="audit-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="audit-modal-header">
              <div>
                <h3 id="audit-modal-title">
                  Inspección de Modificación #{selectedItem.id} —{" "}
                  {ENTITY_LABELS[selectedItem.entidad] ?? selectedItem.entidad}
                </h3>
                <p>
                  {ACTION_LABELS[selectedItem.accion] ?? selectedItem.accion} sobre
                  el registro #{selectedItem.entidad_id} · Ejecutado el{" "}
                  {formatDateParts(selectedItem.ocurrido_at).date} a las{" "}
                  {formatDateParts(selectedItem.ocurrido_at).time}
                </p>
              </div>
              <button
                type="button"
                className="audit-modal-close"
                aria-label="Cerrar ventana"
                onClick={() => setSelectedItem(null)}
              >
                ✕
              </button>
            </div>

            <div className="audit-modal-body">
              {/* Summary Strip */}
              <div className="audit-summary-strip">
                <div className="audit-summary-item">
                  <span>Autor del cambio</span>
                  <strong>
                    {selectedItem.usuario_nombre_completo ||
                      selectedItem.nombre_usuario ||
                      "Sistema"}{" "}
                    (@{selectedItem.nombre_usuario ?? "sistema"})
                  </strong>
                </div>
                <div className="audit-summary-item">
                  <span>Rol y Dirección IP</span>
                  <strong>
                    {selectedItem.usuario_roles.join(", ") || "ADMIN"} ·{" "}
                    {selectedItem.ip_origen ?? "127.0.0.1"}
                  </strong>
                </div>
                <div className="audit-summary-item">
                  <span>Motivo Declarado</span>
                  <strong>
                    {selectedItem.motivo || "Sin observación adicional"}
                  </strong>
                </div>
                <div className="audit-summary-item">
                  <span>Estado Actual</span>
                  <strong>
                    {selectedItem.revertido
                      ? `Revertido por @${selectedItem.revertido_por ?? "admin"}`
                      : "Modificación Vigente (Reversible)"}
                  </strong>
                </div>
              </div>

              {/* Field-by-field Diff Table */}
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "0.55rem",
                  }}
                >
                  <strong style={{ fontSize: "0.86rem", color: "#0f172a" }}>
                    Comparativa de Campos (Valor Anterior vs. Valor Actual)
                  </strong>
                  <button
                    type="button"
                    className="audit-btn-inspect"
                    onClick={() => setShowRawJson((v) => !v)}
                  >
                    {showRawJson
                      ? "Ocultar JSON de Base de Datos"
                      : "Ver JSON completo (BD)"}
                  </button>
                </div>

                <table className="audit-diff-table">
                  <thead>
                    <tr>
                      <th>Campo</th>
                      <th>Valor Anterior (valor_anterior)</th>
                      <th>Valor Actual (valor_nuevo)</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedDiffs.map((diff) => (
                      <tr
                        key={diff.key}
                        className={diff.changed ? "changed-field" : ""}
                      >
                        <td style={{ fontWeight: 700, color: "#1e293b" }}>
                          {diff.label}
                        </td>
                        <td
                          className={
                            diff.changed ? "audit-diff-cell-old" : undefined
                          }
                        >
                          {diff.oldVal}
                        </td>
                        <td
                          className={
                            diff.changed ? "audit-diff-cell-new" : undefined
                          }
                        >
                          {diff.newVal}
                        </td>
                        <td>
                          {diff.changed ? (
                            <span
                              style={{
                                fontSize: "0.72rem",
                                fontWeight: 700,
                                color: "#b45309",
                              }}
                            >
                              Modificado
                            </span>
                          ) : (
                            <span
                              style={{ fontSize: "0.72rem", color: "#94a3b8" }}
                            >
                              Sin cambio
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Optional Raw JSON View */}
              {showRawJson && (
                <div className="audit-json-grid">
                  <div className="audit-json-box">
                    <div className="audit-json-box-header old">
                      Snapshot Anterior (valor_anterior)
                    </div>
                    <pre className="audit-json-pre">
                      {JSON.stringify(selectedItem.valor_anterior, null, 2)}
                    </pre>
                  </div>
                  <div className="audit-json-box">
                    <div className="audit-json-box-header new">
                      Snapshot Nuevo (valor_nuevo)
                    </div>
                    <pre className="audit-json-pre">
                      {JSON.stringify(selectedItem.valor_nuevo, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {/* Revert Action Box */}
              {!selectedItem.revertido ? (
                <div className="audit-revert-box">
                  <h4>Revertir esta modificación al estado anterior</h4>
                  <p>
                    Al confirmar, el sistema restaurará los valores de{" "}
                    <strong>valor_anterior</strong> directamente en la tabla{" "}
                    <code>{selectedItem.entidad}</code> (Registro #
                    {selectedItem.entidad_id}) y dejará constancia inmutable de
                    la reversión.
                  </p>
                  <div className="audit-preset-chips">
                    {REVERT_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        className="audit-preset-chip"
                        onClick={() => setRevertMotivo(preset)}
                      >
                        + {preset}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    className="audit-revert-input"
                    placeholder="Motivo de seguridad para revertir este cambio (opcional)..."
                    value={revertMotivo}
                    onChange={(e) => setRevertMotivo(e.target.value)}
                  />
                </div>
              ) : (
                <div
                  className="audit-feedback-banner success"
                  style={{ margin: 0 }}
                >
                  <span>
                    ✓ Este cambio ya fue revertido por @
                    {selectedItem.revertido_por ?? "admin"}
                    {selectedItem.revertido_motivo
                      ? ` — Motivo: «${selectedItem.revertido_motivo}»`
                      : ""}
                  </span>
                </div>
              )}
            </div>

            <div className="audit-modal-footer">
              <button
                type="button"
                className="audit-btn-inspect"
                onClick={() => setSelectedItem(null)}
              >
                Cerrar ventana
              </button>
              {!selectedItem.revertido && (
                <button
                  type="button"
                  className="audit-btn-confirm-revert"
                  onClick={() => void handleRevert()}
                  disabled={reverting}
                >
                  {reverting
                    ? "Restaurando datos anteriores..."
                    : "↺ Confirmar y Revertir al Valor Anterior"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
