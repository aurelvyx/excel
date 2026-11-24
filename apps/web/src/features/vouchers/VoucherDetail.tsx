import { useState, type FormEvent } from "react";
import { CheckCircle2, XCircle, Receipt, Link2, Unlock } from "lucide-react";
import { api, errorText, text, type Row } from "../../shared/api";
import { Dialog } from "../../shared/Dialog";
import { Button } from "../../shared/ui/Button";
import { InputField } from "../../shared/ui/Field";
import { Feedback } from "../../shared/ui/Feedback";
import { voucherStates } from "./model";

export function VoucherDetail({
  voucher,
  onClose,
  onSaved,
}: {
  voucher: Row;
  onClose: () => void;
  onSaved: (row: Row) => void;
}) {
  const [decision, setDecision] = useState("");
  const [note, setNote] = useState("");
  const [review, setReview] = useState(false);
  const [error, fail] = useState("");
  const [busy, pending] = useState(false);

  const canDecide = voucher.estado === "PENDIENTE" && !voucher.matricula_id;
  const st = text(voucher, "estado");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!decision) {
      fail("Selecciona Validar o Rechazar antes de continuar.");
      return;
    }
    if (!review) {
      fail("");
      setReview(true);
      return;
    }
    pending(true);
    fail("");
    try {
      const saved = await api<Row>(`vouchers/${voucher.id}/decision`, {
        method: "PATCH",
        body: {
          estado: decision,
          ...(note.trim() ? { observacion: note.trim() } : {}),
        },
      });
      onSaved(saved);
    } catch (e) {
      fail(errorText(e));
      setReview(false);
    } finally {
      pending(false);
    }
  }

  return (
    <Dialog
      title={`Comprobante de Pago · ${text(voucher, "numero")}`}
      onClose={onClose}
      busy={busy}
    >
      {/* Cabecera Tipo Recibo Oficial */}
      <div
        style={{
          backgroundColor: "#f8fafc",
          border: "1px solid #cbd5e1",
          borderRadius: "0.85rem",
          padding: "1.1rem 1.25rem",
          marginBottom: "1rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", paddingBottom: "0.75rem", borderBottom: "1px dashed #cbd5e1" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Receipt size={18} color="#007a3d" />
            <span style={{ fontFamily: "monospace", fontSize: "0.95rem", fontWeight: 800, color: "#0f172a" }}>
              {text(voucher, "numero")}
            </span>
          </div>
          <span
            className={`academic-badge ${
              st === "VALIDADO"
                ? "badge-green"
                : st === "PENDIENTE"
                  ? "badge-amber"
                  : "badge-gray"
            }`}
          >
            {voucherStates[st] ?? st}
          </span>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.85rem" }}>
          <div>
            <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", display: "block" }}>
              Estudiante Titular
            </span>
            <strong style={{ fontSize: "0.95rem", color: "#0f172a" }}>
              {text(voucher, "estudiante")}
            </strong>
            <span style={{ display: "block", fontSize: "0.75rem", color: "#64748b", fontFamily: "monospace" }}>
              {text(voucher, "tipo_documento")} {text(voucher, "numero_documento")} · Cód: {text(voucher, "codigo_estudiante")}
            </span>
          </div>

          <div style={{ textAlign: "right" }}>
            <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", display: "block" }}>
              Importe Pagado
            </span>
            <strong style={{ fontSize: "1.35rem", fontWeight: 800, color: "#007a3d", fontFamily: "monospace" }}>
              S/ {Number(text(voucher, "importe") || 0).toFixed(2)}
            </strong>
          </div>
        </div>

        <dl className="detail" style={{ margin: 0 }}>
          {[
            ["Fecha de pago", text(voucher, "fecha_pago")],
            [
              "Vínculo de matrícula",
              text(voucher, "matricula_codigo") ? `🔗 ${text(voucher, "matricula_codigo")}` : "🔓 Sin vincular (Libre)",
            ],
            [
              "Responsable de revisión",
              text(voucher, "responsable") || "Pendiente de revisión",
            ],
            [
              "Fecha de decisión",
              voucher.validado_at
                ? new Date(text(voucher, "validado_at")).toLocaleString("es-PE")
                : "Pendiente",
            ],
            ["Observación", text(voucher, "observacion") || "Sin observación"],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {canDecide ? (
        <form onSubmit={(event) => void submit(event)}>
          {review ? (
            <section
              style={{
                padding: "1rem 1.15rem",
                borderRadius: "0.75rem",
                backgroundColor: decision === "VALIDADO" ? "#f0fdf4" : "#fef2f2",
                border: `1px solid ${decision === "VALIDADO" ? "#bbf7d0" : "#fecaca"}`,
                marginBottom: "1rem",
              }}
            >
              <h3 style={{ margin: "0 0 0.35rem 0", fontSize: "0.95rem", color: "#0f172a" }}>
                Confirmar decisión: {voucherStates[decision]}
              </h3>
              <p style={{ margin: "0 0 0.35rem 0", fontSize: "0.82rem", color: "#334155" }}>
                <strong>Observación:</strong> {note.trim() || "Sin observación"}
              </p>
              <p style={{ margin: 0, fontSize: "0.75rem", color: "#64748b" }}>
                Esta decisión quedará auditada con tu usuario y fecha.
              </p>
            </section>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", marginBottom: "1rem" }}>
              <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#334155" }}>
                Selecciona la decisión administrativa sobre este comprobante:
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setDecision("VALIDADO")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.5rem",
                    padding: "0.75rem",
                    borderRadius: "0.75rem",
                    border: decision === "VALIDADO" ? "2px solid #007a3d" : "1px solid #cbd5e1",
                    backgroundColor: decision === "VALIDADO" ? "#f0fdf4" : "#ffffff",
                    color: decision === "VALIDADO" ? "#064e3b" : "#475569",
                    fontWeight: 800,
                    fontSize: "0.85rem",
                    cursor: "pointer",
                  }}
                >
                  <CheckCircle2 size={17} color="#007a3d" /> Validar Voucher
                </button>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setDecision("RECHAZADO")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.5rem",
                    padding: "0.75rem",
                    borderRadius: "0.75rem",
                    border: decision === "RECHAZADO" ? "2px solid #dc2626" : "1px solid #cbd5e1",
                    backgroundColor: decision === "RECHAZADO" ? "#fef2f2" : "#ffffff",
                    color: decision === "RECHAZADO" ? "#991b1b" : "#475569",
                    fontWeight: 800,
                    fontSize: "0.85rem",
                    cursor: "pointer",
                  }}
                >
                  <XCircle size={17} color="#dc2626" /> Rechazar Voucher
                </button>
              </div>

              <InputField
                label="Observación o motivo"
                value={note}
                maxLength={300}
                required={decision === "RECHAZADO"}
                disabled={busy}
                onChange={(event) => setNote(event.target.value)}
                hint={
                  decision === "RECHAZADO"
                    ? "Obligatoria para indicar por qué se rechaza el voucher."
                    : "Opcional para anotaciones de caja o tesorería."
                }
              />
            </div>
          )}

          <Feedback>{error}</Feedback>
          <footer className="actions">
            <Button
              disabled={busy}
              onClick={review ? () => setReview(false) : onClose}
            >
              {review ? "Volver a editar" : "Cerrar"}
            </Button>
            <Button
              type="submit"
              variant="primary"
              busy={busy}
              busyLabel="Guardando…"
              disabled={!decision}
            >
              {review ? "✓ Confirmar Decisión" : "Continuar"}
            </Button>
          </footer>
        </form>
      ) : (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem" }}>
          <div style={{ fontSize: "0.8rem", color: "#475569", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            {voucher.matricula_id ? (
              <>
                <Link2 size={15} color="#7c3aed" />
                <span>Este comprobante ya fue consumido en la matrícula <strong>{text(voucher, "matricula_codigo")}</strong>.</span>
              </>
            ) : (
              <>
                <Unlock size={15} color="#007a3d" />
                <span>La decisión ya está registrada ({voucherStates[st] ?? st}).</span>
              </>
            )}
          </div>
          <Button onClick={onClose}>Cerrar</Button>
        </div>
      )}
    </Dialog>
  );
}
