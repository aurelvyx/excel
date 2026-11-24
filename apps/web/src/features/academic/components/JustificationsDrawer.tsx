import React, { useState, useEffect } from "react";
import { X, CheckCircle2, XCircle, AlertCircle, FileText, Send } from "lucide-react";
import { api, errorText } from "../../../shared/api";
import "../academic.css";

interface JustificationItem {
  asistencia_id: string;
  asistencia_version: number;
  codigo: string;
  sesion_id: string;
  fecha_sesion: string;
  matricula_id: string;
  estudiante: string;
  numero_documento: string;
  puedeRegistrar?: boolean;
  puedeResolver?: boolean;
  motivoSoloLectura?: string | null;
  justificacion?: {
    id: string;
    asistencia_id: string;
    motivo: string;
    fecha_presentacion: string;
    estado: "PENDIENTE" | "APROBADA" | "RECHAZADA" | "RECUPERADA" | "NO_RECUPERADA";
    version: number;
    registrado_nombre?: string;
    resuelto_nombre?: string;
    observacion_resolucion?: string;
  } | null;
}

interface JustificationsDrawerProps {
  groupId: string;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

export const JustificationsDrawer: React.FC<JustificationsDrawerProps> = ({
  groupId,
  isOpen,
  onClose,
  onUpdated,
}) => {
  const [items, setItems] = useState<JustificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedItem, setSelectedItem] = useState<JustificationItem | null>(null);
  const [motivo, setMotivo] = useState("");
  const [observacion, setObservacion] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadJustifications();
    }
  }, [isOpen, groupId]);

  async function loadJustifications() {
    setLoading(true);
    setError("");
    try {
      const res = await api<{ items: JustificationItem[] }>(
        `asistencia/grupos/${groupId}/justificaciones?limit=50`
      );
      setItems(res.items || []);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateJustification(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedItem || !motivo.trim()) return;

    setActionLoading(true);
    setError("");
    try {
      await api(`asistencia/grupos/${groupId}/justificaciones`, {
        method: "POST",
        body: {
          asistenciaId: selectedItem.asistencia_id,
          asistenciaVersion: selectedItem.asistencia_version,
          motivo: motivo.trim(),
          fechaPresentacion: new Date().toISOString().split("T")[0],
        },
      });
      setSelectedItem(null);
      setMotivo("");
      await loadJustifications();
      onUpdated();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleResolve(justificacionId: string, version: number, estado: "APROBADA" | "RECHAZADA") {
    setActionLoading(true);
    setError("");
    try {
      await api(`asistencia/grupos/${groupId}/justificaciones/${justificacionId}/resolver`, {
        method: "PATCH",
        body: {
          estado,
          version,
          observacion: observacion.trim() || undefined,
        },
      });
      setSelectedItem(null);
      setObservacion("");
      await loadJustifications();
      onUpdated();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setActionLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="academic-drawer-overlay" onClick={onClose}>
      <div className="academic-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="academic-drawer-header">
          <div>
            <h3 style={{ margin: 0, fontSize: "1.125rem", color: "#1e293b", fontWeight: 700 }}>
              Justificaciones de Inasistencia
            </h3>
            <p style={{ margin: "0.25rem 0 0", fontSize: "0.8125rem", color: "#64748b" }}>
              Inasistencias registradas y solicitudes formales del grupo
            </p>
          </div>
          <button type="button" onClick={onClose} className="academic-drawer-close-btn">
            <X size={18} />
          </button>
        </div>

        {error && (
          <div style={{ padding: "0.75rem 1.25rem", backgroundColor: "#fee2e2", color: "#991b1b", fontSize: "0.8125rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="academic-drawer-body">
          {loading ? (
            <div style={{ padding: "2rem", textAlign: "center", color: "#64748b" }}>
              Cargando inasistencias y justificaciones…
            </div>
          ) : items.length === 0 ? (
            <div style={{ padding: "3rem 1.5rem", textAlign: "center", color: "#94a3b8" }}>
              <CheckCircle2 size={40} color="#10b981" style={{ margin: "0 auto 1rem", opacity: 0.8 }} />
              <h4 style={{ margin: 0, color: "#334155" }}>¡Sin inasistencias pendientes!</h4>
              <p style={{ margin: "0.5rem 0 0", fontSize: "0.8125rem" }}>
                No hay inasistencias ni justificaciones registradas en este grupo.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {items.map((it) => {
                const j = it.justificacion;
                const statusColor =
                  j?.estado === "APROBADA"
                    ? { bg: "#dcfce7", text: "#166534", border: "#bbf7d0" }
                    : j?.estado === "RECHAZADA"
                    ? { bg: "#fee2e2", text: "#991b1b", border: "#fecaca" }
                    : j?.estado === "PENDIENTE"
                    ? { bg: "#fef3c7", text: "#92400e", border: "#fde68a" }
                    : { bg: "#f1f5f9", text: "#475569", border: "#e2e8f0" };

                return (
                  <div
                    key={`${it.asistencia_id}-${it.fecha_sesion}`}
                    className="academic-justification-card"
                    style={{
                      border: `1px solid ${statusColor.border}`,
                      backgroundColor: "#ffffff",
                      borderRadius: "0.625rem",
                      padding: "1rem",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
                      <div>
                        <strong style={{ color: "#1e293b", fontSize: "0.875rem", display: "block" }}>
                          {it.estudiante}
                        </strong>
                        <span style={{ fontSize: "0.75rem", color: "#64748b", fontFamily: "monospace" }}>
                          DNI: {it.numero_documento} • Sesión: {it.fecha_sesion}
                        </span>
                      </div>
                      <span
                        style={{
                          fontSize: "0.6875rem",
                          fontWeight: 700,
                          padding: "0.2rem 0.5rem",
                          borderRadius: "0.375rem",
                          backgroundColor: statusColor.bg,
                          color: statusColor.text,
                        }}
                      >
                        {j ? j.estado : "SIN SOLICITUD"}
                      </span>
                    </div>

                    {j ? (
                      <div style={{ background: "#f8fafc", padding: "0.625rem", borderRadius: "0.375rem", fontSize: "0.8125rem", marginBottom: "0.5rem" }}>
                        <div style={{ color: "#334155", fontWeight: 600 }}>Motivo presentado:</div>
                        <p style={{ margin: "0.25rem 0", color: "#475569" }}>{j.motivo}</p>
                        <div style={{ fontSize: "0.6875rem", color: "#94a3b8" }}>
                          Presentado el: {j.fecha_presentacion} {j.registrado_nombre && `por ${j.registrado_nombre}`}
                        </div>
                        {j.observacion_resolucion && (
                          <div style={{ marginTop: "0.35rem", fontSize: "0.75rem", color: "#64748b", fontStyle: "italic" }}>
                            Resolución: {j.observacion_resolucion}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginBottom: "0.5rem" }}>
                        Inasistencia marcada (código: {it.codigo}) sin trámite de justificación iniciado.
                      </div>
                    )}

                    {/* Acciones */}
                    <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                      {!j && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedItem(it);
                            setMotivo("");
                          }}
                          className="academic-btn-action btn-action-secondary"
                          style={{ fontSize: "0.75rem", padding: "0.35rem 0.75rem" }}
                        >
                          <FileText size={13} /> Presentar Justificación
                        </button>
                      )}

                      {j && j.estado === "PENDIENTE" && (
                        <div style={{ display: "flex", gap: "0.5rem", width: "100%" }}>
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleResolve(j.id, j.version, "APROBADA")}
                            className="academic-btn-action"
                            style={{
                              backgroundColor: "#16a34a",
                              color: "#fff",
                              border: "none",
                              fontSize: "0.75rem",
                              padding: "0.35rem 0.75rem",
                              flex: 1,
                            }}
                          >
                            <CheckCircle2 size={13} /> Aprobar
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleResolve(j.id, j.version, "RECHAZADA")}
                            className="academic-btn-action"
                            style={{
                              backgroundColor: "#dc2626",
                              color: "#fff",
                              border: "none",
                              fontSize: "0.75rem",
                              padding: "0.35rem 0.75rem",
                              flex: 1,
                            }}
                          >
                            <XCircle size={13} /> Rechazar
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Formulario Modal si se seleccionó una inasistencia para registrar */}
          {selectedItem && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                backgroundColor: "rgba(15, 23, 42, 0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1100,
                padding: "1rem",
              }}
            >
              <div
                style={{
                  backgroundColor: "#ffffff",
                  borderRadius: "0.75rem",
                  width: "100%",
                  maxWidth: "420px",
                  padding: "1.25rem",
                  boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                  <h4 style={{ margin: 0, color: "#1e293b" }}>Registrar Justificación</h4>
                  <button type="button" onClick={() => setSelectedItem(null)} style={{ background: "none", border: "none", cursor: "pointer" }}>
                    <X size={16} />
                  </button>
                </div>

                <p style={{ margin: "0 0 1rem", fontSize: "0.8125rem", color: "#64748b" }}>
                  Alumno: <strong style={{ color: "#1e293b" }}>{selectedItem.estudiante}</strong>
                  <br />
                  Sesión: {selectedItem.fecha_sesion}
                </p>

                <form onSubmit={handleCreateJustification}>
                  <div style={{ marginBottom: "1rem" }}>
                    <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "#475569", marginBottom: "0.35rem" }}>
                      Motivo o Sustento de la Inasistencia *
                    </label>
                    <textarea
                      required
                      rows={3}
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      placeholder="Ej. Cita médica acreditada con certificado, fuerza mayor..."
                      style={{
                        width: "100%",
                        padding: "0.5rem",
                        borderRadius: "0.375rem",
                        border: "1px solid #cbd5e1",
                        fontSize: "0.8125rem",
                        resize: "vertical",
                      }}
                    />
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                    <button
                      type="button"
                      onClick={() => setSelectedItem(null)}
                      className="academic-btn-action btn-action-secondary"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={actionLoading || !motivo.trim()}
                      className="academic-btn-action btn-action-primary"
                    >
                      <Send size={13} /> {actionLoading ? "Enviando…" : "Registrar"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
