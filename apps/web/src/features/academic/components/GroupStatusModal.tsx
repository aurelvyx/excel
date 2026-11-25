import React, { useState } from "react";
import { X, AlertCircle, SlidersHorizontal, Unlock, Lock } from "lucide-react";
import { api, errorText, type Row } from "../../../shared/api";
import "../academic.css";

interface GroupStatusModalProps {
  group: Row;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newStatus: string) => void;
}

export const GroupStatusModal: React.FC<GroupStatusModalProps> = ({
  group,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const currentEstado = String(group.estado || "ACTIVO");
  const [estado, setEstado] = useState<"PLANIFICADO" | "ACTIVO" | "CERRADO">(
    currentEstado === "CERRADO" ? "CERRADO" : currentEstado === "PLANIFICADO" ? "PLANIFICADO" : "ACTIVO"
  );
  const [motivo, setMotivo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const isReleasingForTeacher = currentEstado === "CERRADO" && estado === "ACTIVO";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api(`oferta/grupos/${group.id}`, {
        method: "PATCH",
        body: {
          estado,
          motivo:
            motivo.trim() ||
            (isReleasingForTeacher
              ? "Liberación administrativa de salón para ajustes docentes"
              : `Cambio de estado administrativo a ${estado}`),
        },
      });
      onSuccess(estado);
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="academic-modal-overlay" onClick={onClose}>
      <div className="academic-modal" style={{ maxWidth: "500px" }} onClick={(e) => e.stopPropagation()}>
        <div className="academic-modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
            <div style={{ padding: "0.5rem", borderRadius: "0.5rem", backgroundColor: "#f0fdf4", color: "#166534" }}>
              <SlidersHorizontal size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.05rem", color: "#1e293b", fontWeight: 700 }}>
                Estado y Acceso Docente: {String(group.codigo)}
              </h3>
              <p style={{ margin: "0.2rem 0 0", fontSize: "0.75rem", color: "#64748b" }}>
                Control de apertura, bloqueo y liberación del salón para el docente
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="academic-drawer-close-btn">
            <X size={18} />
          </button>
        </div>

        {error && (
          <div style={{ margin: "1rem 1.25rem 0", padding: "0.75rem 1rem", backgroundColor: "#fee2e2", color: "#991b1b", fontSize: "0.8125rem", borderRadius: "0.5rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ padding: "1.25rem" }}>
          <div style={{ marginBottom: "1.25rem" }}>
            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", marginBottom: "0.5rem" }}>
              Seleccionar Nuevo Estado del Salón
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem" }}>
              <button
                type="button"
                onClick={() => setEstado("PLANIFICADO")}
                style={{
                  padding: "0.625rem 0.5rem",
                  borderRadius: "0.5rem",
                  border: `2px solid ${estado === "PLANIFICADO" ? "#0284c7" : "#e2e8f0"}`,
                  backgroundColor: estado === "PLANIFICADO" ? "#f0f9ff" : "#ffffff",
                  color: estado === "PLANIFICADO" ? "#0369a1" : "#475569",
                  fontWeight: 600,
                  fontSize: "0.75rem",
                  cursor: "pointer",
                  textAlign: "center",
                }}
              >
                Planificado
              </button>

              <button
                type="button"
                onClick={() => setEstado("ACTIVO")}
                style={{
                  padding: "0.625rem 0.5rem",
                  borderRadius: "0.5rem",
                  border: `2px solid ${estado === "ACTIVO" ? "#007a3d" : "#e2e8f0"}`,
                  backgroundColor: estado === "ACTIVO" ? "#f0fdf4" : "#ffffff",
                  color: estado === "ACTIVO" ? "#166534" : "#475569",
                  fontWeight: 600,
                  fontSize: "0.75rem",
                  cursor: "pointer",
                  textAlign: "center",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.25rem",
                }}
              >
                <Unlock size={13} /> {currentEstado === "CERRADO" ? "Liberar (Activo)" : "Activo"}
              </button>

              <button
                type="button"
                onClick={() => setEstado("CERRADO")}
                style={{
                  padding: "0.625rem 0.5rem",
                  borderRadius: "0.5rem",
                  border: `2px solid ${estado === "CERRADO" ? "#dc2626" : "#e2e8f0"}`,
                  backgroundColor: estado === "CERRADO" ? "#fef2f2" : "#ffffff",
                  color: estado === "CERRADO" ? "#991b1b" : "#475569",
                  fontWeight: 600,
                  fontSize: "0.75rem",
                  cursor: "pointer",
                  textAlign: "center",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.25rem",
                }}
              >
                <Lock size={13} /> Cerrado
              </button>
            </div>
          </div>

          <div
            style={{
              padding: "0.75rem 0.9rem",
              backgroundColor: isReleasingForTeacher
                ? "#f0fdf4"
                : estado === "CERRADO"
                  ? "#fef2f2"
                  : "#f8fafc",
              borderRadius: "0.5rem",
              border: `1px solid ${
                isReleasingForTeacher
                  ? "#bbf7d0"
                  : estado === "CERRADO"
                    ? "#fecaca"
                    : "#e2e8f0"
              }`,
              marginBottom: "1.25rem",
              fontSize: "0.75rem",
              color: "#475569",
            }}
          >
            {isReleasingForTeacher ? (
              <span style={{ color: "#166534" }}>
                🔓 <strong>Liberación Temporal para el Docente:</strong> Al pasar el salón de <strong>CERRADO</strong> a <strong>ACTIVO</strong>, el docente asignado volverá a tener acceso al salón para registrar asistencias o calificaciones pendientes (siempre que el Acta aún no haya sido sellada).
              </span>
            ) : estado === "CERRADO" ? (
              <span style={{ color: "#b91c1c" }}>
                🔒 <strong>Salón Cerrado (Bloqueado para Docente):</strong> El docente ya no tendrá acceso a este salón desde su portal a menos que un Administrador lo libere nuevamente.
              </span>
            ) : estado === "ACTIVO" ? (
              <span>
                ✓ <strong>Salón Activo:</strong> Habilitado para el docente asignado. Permite registrar asistencias y calificaciones dentro del periodo abierto.
              </span>
            ) : (
              <span>
                ℹ️ <strong>Salón Planificado:</strong> El salón se encuentra en preparación para el inicio de clases.
              </span>
            )}
          </div>

          <div style={{ marginBottom: "1.25rem" }}>
            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "#475569", marginBottom: "0.35rem" }}>
              Motivo de Auditoría {isReleasingForTeacher ? "(Requerido para liberar)" : ""}
            </label>
            <input
              type="text"
              required={isReleasingForTeacher}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder={
                isReleasingForTeacher
                  ? "Ej. Liberación autorizada para completar notas de la Unidad 4..."
                  : "Ej. Fin de ciclo de clases, inicio de evaluaciones..."
              }
              className="input-field"
              style={{ width: "100%", fontSize: "0.8125rem", padding: "0.45rem 0.75rem" }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", borderTop: "1px solid #f1f5f9", paddingTop: "1rem" }}>
            <button
              type="button"
              onClick={onClose}
              className="academic-btn-action btn-action-secondary"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="academic-btn-action btn-action-primary"
            >
              {loading
                ? "Guardando…"
                : isReleasingForTeacher
                  ? "Liberar Salón para Docente"
                  : "Actualizar Estado"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
