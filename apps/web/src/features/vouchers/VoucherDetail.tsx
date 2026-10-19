import { useState, type FormEvent } from "react";
import { api, errorText, text, type Row } from "../../shared/api";
import { Dialog } from "../../shared/Dialog";
import { Button } from "../../shared/ui/Button";
import { InputField, SelectField } from "../../shared/ui/Field";
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
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!review) {
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
      title={`Voucher ${text(voucher, "numero")}`}
      onClose={onClose}
      busy={busy}
    >
      <dl className="detail">
        {[
          [
            "Estudiante",
            `${text(voucher, "estudiante")} · ${text(voucher, "codigo_estudiante")}`,
          ],
          [
            "Documento",
            `${text(voucher, "tipo_documento")} ${text(voucher, "numero_documento")}`,
          ],
          ["Fecha de pago", text(voucher, "fecha_pago")],
          ["Importe", text(voucher, "importe")],
          ["Estado", voucherStates[text(voucher, "estado")]],
          [
            "Responsable",
            text(voucher, "responsable") || "Pendiente de revisión",
          ],
          [
            "Fecha de decisión",
            voucher.validado_at
              ? new Date(text(voucher, "validado_at")).toLocaleString("es-PE")
              : "Pendiente",
          ],
          ["Observación", text(voucher, "observacion") || "Sin observación"],
          ["Matrícula", text(voucher, "matricula_codigo") || "Sin vincular"],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {canDecide ? (
        <form onSubmit={(event) => void submit(event)}>
          <p className="notice">
            Revisa el comprobante físico antes de decidir. La decisión se
            guardará con tu usuario y fecha.
          </p>
          {review ? (
            <section className="review">
              <h3>Confirmar decisión</h3>
              <p>
                {voucherStates[decision]} · {note.trim() || "Sin observación"}
              </p>
              <p>
                Esta decisión quedará registrada y no se podrá sustituir desde
                esta pantalla.
              </p>
            </section>
          ) : (
            <div className="form-grid">
              <SelectField
                label="Decisión"
                value={decision}
                required
                disabled={busy}
                onChange={(event) => setDecision(event.target.value)}
              >
                <option value="">Selecciona una decisión</option>
                <option value="VALIDADO">Validar</option>
                <option value="RECHAZADO">Rechazar</option>
              </SelectField>
              <InputField
                label="Observación"
                value={note}
                maxLength={300}
                required={decision === "RECHAZADO"}
                disabled={busy}
                onChange={(event) => setNote(event.target.value)}
                hint="Obligatoria para rechazar el voucher."
              />
            </div>
          )}
          <Feedback>{error}</Feedback>
          <footer className="actions">
            <Button
              disabled={busy}
              onClick={review ? () => setReview(false) : onClose}
            >
              {review ? "Volver a editar" : "Cancelar"}
            </Button>
            <Button
              type="submit"
              variant="primary"
              busy={busy}
              busyLabel="Guardando…"
            >
              {review ? "Confirmar decisión" : "Revisar decisión"}
            </Button>
          </footer>
        </form>
      ) : (
        <Feedback tone="notice">
          {voucher.matricula_id
            ? "Este voucher ya está vinculado a una matrícula."
            : "La decisión ya está registrada."}
        </Feedback>
      )}
    </Dialog>
  );
}
