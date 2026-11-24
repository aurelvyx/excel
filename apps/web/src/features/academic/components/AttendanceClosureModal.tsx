import React, { useState, useEffect } from "react";
import { X, ShieldAlert, CheckCircle2, Lock, AlertTriangle } from "lucide-react";
import { api, errorText } from "../../../shared/api";
import "../academic.css";

interface ClosureSummary {
  grupoId: string;
  revision: string;
  totalEstudiantes: number;
  totalSesiones: number;
  sesionesConcluidas: number;
  justificacionesPendientes: number;
  marcasPendientes: number;
  asistenciaCerrada: boolean;
  estudiantesEnRiesgoDpi: Array<{
    matriculaId: string;
    estudiante: string;
    numeroDocumento: string;
    totalFaltas: number;
    porcentajeInasistencia: number;
    condicionDpi: boolean;
  }>;
}

interface AttendanceClosureModalProps {
  groupId: string;
  isOpen: boolean;
  onClose: () => void;
  onClosedSuccessfully: () => void;
}

export const AttendanceClosureModal: React.FC<AttendanceClosureModalProps> = ({
  groupId,
  isOpen,
  onClose,
  onClosedSuccessfully,
}) => {
  const [data, setData] = useState<ClosureSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState("");
  const [confirmCheckbox, setConfirmCheckbox] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadReview();
      setConfirmCheckbox(false);
    }
  }, [isOpen, groupId]);

  async function loadReview() {
    setLoading(true);
    setError("");
    try {
      const res = await api<any>(`asistencia/grupos/${groupId}/cierre`);
      const items = res.items || res.estudiantes || [];
      const adv = res.advertencias || {};
      // Normalizar estructura del backend
      setData({
        grupoId: res.grupo?.id || groupId,
        revision: res.revision || "",
        totalEstudiantes: items.length,
        totalSesiones:
          (adv.sesionesComputables || 0) +
          (adv.sesionesProgramadas || 0) +
          (adv.sesionesCanceladas || 0),
        sesionesConcluidas: adv.sesionesComputables || 0,
        justificacionesPendientes:
          adv.justificacionesPendientes ?? res.justificacionesPendientes ?? 0,
        marcasPendientes: adv.marcasPendientes ?? 0,
        asistenciaCerrada: !!(res.cierre || res.grupo?.asistencia_cerrada),
        estudiantesEnRiesgoDpi: items
          .filter((e: any) => {
            const summary = e.resumenAsistencia;
            if (summary) {
              return (
                summary.excedeLimite === true ||
                summary.condicion === "RETIRADO_INASISTENCIA"
              );
            }
            return (e.porcentaje_inasistencia || 0) >= 30 || e.condicion_dpi;
          })
          .map((e: any) => {
            const summary = e.resumenAsistencia;
            const pct = summary
              ? Number(summary.inasistenciaPct || 0)
              : Number(e.porcentaje_inasistencia || 0);
            return {
              matriculaId: e.matricula_id,
              estudiante: e.estudiante,
              numeroDocumento: e.numero_documento,
              totalFaltas: summary
                ? summary.faltasComputables ?? summary.faltas ?? 0
                : e.total_faltas || 0,
              porcentajeInasistencia: Math.round(pct * 100) / 100,
              condicionDpi: true,
            };
          }),
      });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleCloseAttendance() {
    if (!confirmCheckbox || !data?.revision) return;
    setClosing(true);
    setError("");
    try {
      await api(`asistencia/grupos/${groupId}/cierre`, {
        method: "POST",
        body: {
          revision: data.revision,
          confirmarPendientes: true,
          motivo: "Cierre de asistencia confirmado desde Salón 360",
        },
      });
      onClosedSuccessfully();
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setClosing(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="academic-modal-overlay" onClick={onClose}>
      <div className="academic-modal" style={{ maxWidth: "600px" }} onClick={(e) => e.stopPropagation()}>
        <div className="academic-modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
            <div style={{ padding: "0.5rem", borderRadius: "0.5rem", backgroundColor: "#fef2f2", color: "#dc2626" }}>
              <Lock size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.125rem", color: "#1e293b", fontWeight: 700 }}>
                Cierre Oficial de Asistencia
              </h3>
              <p style={{ margin: "0.2rem 0 0", fontSize: "0.8125rem", color: "#64748b" }}>
                Validación previa de inasistencias y determinación de condición DPI
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="academic-drawer-close-btn">
            <X size={18} />
          </button>
        </div>

        {error && (
          <div style={{ margin: "1rem 1.5rem 0", padding: "0.75rem 1rem", backgroundColor: "#fee2e2", color: "#991b1b", fontSize: "0.8125rem", borderRadius: "0.5rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}

        <div style={{ padding: "1.25rem 1.5rem" }}>
          {loading ? (
            <div style={{ padding: "2rem", textAlign: "center", color: "#64748b" }}>
              Analizando historial de sesiones y cálculo de inasistencias…
            </div>
          ) : !data ? (
            <div style={{ padding: "2rem", textAlign: "center", color: "#64748b" }}>
              No se pudo obtener la información de cierre.
            </div>
          ) : (
            <div>
              {/* Alerta si ya está cerrada */}
              {data.asistenciaCerrada ? (
                <div style={{ padding: "1rem", backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "0.5rem", marginBottom: "1rem", display: "flex", gap: "0.75rem", alignItems: "center" }}>
                  <CheckCircle2 size={24} color="#16a34a" />
                  <div>
                    <strong style={{ color: "#166534", fontSize: "0.875rem", display: "block" }}>
                      La asistencia de este salón ya se encuentra cerrada oficialmente
                    </strong>
                    <span style={{ fontSize: "0.8125rem", color: "#15803d" }}>
                      Las asistencias están selladas para fines de actas de evaluación final.
                    </span>
                  </div>
                </div>
              ) : (
                <>
                  {/* Resumen de Asistencia */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1.25rem" }}>
                    <div style={{ padding: "0.875rem", backgroundColor: "#f8fafc", borderRadius: "0.5rem", border: "1px solid #e2e8f0" }}>
                      <div style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>Total de Estudiantes</div>
                      <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#1e293b", marginTop: "0.25rem" }}>
                        {data.totalEstudiantes}
                      </div>
                    </div>
                    <div style={{ padding: "0.875rem", backgroundColor: "#f8fafc", borderRadius: "0.5rem", border: "1px solid #e2e8f0" }}>
                      <div style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>Justificaciones Pendientes</div>
                      <div style={{ fontSize: "1.25rem", fontWeight: 700, color: data.justificacionesPendientes > 0 ? "#d97706" : "#16a34a", marginTop: "0.25rem" }}>
                        {data.justificacionesPendientes}
                      </div>
                    </div>
                  </div>

                  {data.justificacionesPendientes > 0 && (
                    <div style={{ padding: "0.75rem 1rem", backgroundColor: "#fef3c7", border: "1px solid #fde68a", borderRadius: "0.5rem", marginBottom: "1.25rem", fontSize: "0.8125rem", color: "#92400e", display: "flex", gap: "0.5rem" }}>
                      <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                      <div>
                        Existen <strong>{data.justificacionesPendientes} solicitud(es) de justificación pendiente(s)</strong> de resolución. Se recomienda resolverlas antes de sellar la asistencia.
                      </div>
                    </div>
                  )}

                  {/* Estudiantes en condición DPI */}
                  <div style={{ marginBottom: "1.25rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                      <ShieldAlert size={16} color="#dc2626" />
                      <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "#1e293b" }}>
                        Alumnos en Condición DPI ({data.estudiantesEnRiesgoDpi.length})
                      </span>
                    </div>

                    {data.estudiantesEnRiesgoDpi.length === 0 ? (
                      <div style={{ padding: "0.875rem", backgroundColor: "#f0fdf4", borderRadius: "0.5rem", color: "#166534", fontSize: "0.8125rem" }}>
                        ✓ Ningún estudiante supera el límite del 30% de inasistencias injustificadas.
                      </div>
                    ) : (
                      <div style={{ border: "1px solid #fecaca", borderRadius: "0.5rem", overflow: "hidden" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
                          <thead>
                            <tr style={{ backgroundColor: "#fef2f2", color: "#991b1b", textAlign: "left" }}>
                              <th style={{ padding: "0.5rem 0.75rem" }}>Estudiante</th>
                              <th style={{ padding: "0.5rem 0.75rem", textAlign: "center" }}>% Inasist.</th>
                              <th style={{ padding: "0.5rem 0.75rem", textAlign: "center" }}>Estado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.estudiantesEnRiesgoDpi.map((e) => (
                              <tr key={e.matriculaId} style={{ borderTop: "1px solid #fee2e2" }}>
                                <td style={{ padding: "0.5rem 0.75rem", fontWeight: 600, color: "#1e293b" }}>
                                  {e.estudiante}
                                  <div style={{ fontSize: "0.6875rem", color: "#64748b", fontFamily: "monospace" }}>
                                    DNI: {e.numeroDocumento}
                                  </div>
                                </td>
                                <td style={{ padding: "0.5rem 0.75rem", textAlign: "center", color: "#dc2626", fontWeight: 700 }}>
                                  {e.porcentajeInasistencia}%
                                </td>
                                <td style={{ padding: "0.5rem 0.75rem", textAlign: "center" }}>
                                  <span style={{ padding: "0.2rem 0.45rem", backgroundColor: "#fee2e2", color: "#991b1b", borderRadius: "0.25rem", fontSize: "0.6875rem", fontWeight: 700 }}>
                                    DPI
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Confirmación Checkbox */}
                  <div style={{ padding: "0.875rem", backgroundColor: "#f8fafc", borderRadius: "0.5rem", border: "1px solid #e2e8f0", marginBottom: "1rem" }}>
                    <label style={{ display: "flex", gap: "0.625rem", alignItems: "flex-start", cursor: "pointer", fontSize: "0.8125rem", color: "#334155" }}>
                      <input
                        type="checkbox"
                        checked={confirmCheckbox}
                        onChange={(e) => setConfirmCheckbox(e.target.checked)}
                        style={{ marginTop: "0.15rem", accentColor: "#007a3d" }}
                      />
                      <span>
                        Confirmo que se han registrado todas las sesiones y asistencias del ciclo. Entiendo que este cierre oficial sella el cómputo de inasistencias para la emisión de notas finales.
                      </span>
                    </label>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div style={{ padding: "1rem 1.5rem", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: "0.625rem", backgroundColor: "#f8fafc" }}>
          <button
            type="button"
            onClick={onClose}
            className="academic-btn-action btn-action-secondary"
          >
            {data?.asistenciaCerrada ? "Cerrar Ventana" : "Cancelar"}
          </button>

          {data && !data.asistenciaCerrada && (
            <button
              type="button"
              disabled={!confirmCheckbox || closing}
              onClick={handleCloseAttendance}
              className="academic-btn-action"
              style={{
                backgroundColor: "#dc2626",
                color: "#ffffff",
                border: "none",
                fontWeight: 600,
                opacity: !confirmCheckbox || closing ? 0.5 : 1,
                cursor: !confirmCheckbox || closing ? "not-allowed" : "pointer",
              }}
            >
              <Lock size={14} /> {closing ? "Sellando Asistencia…" : "Cerrar Asistencia Oficialmente"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
