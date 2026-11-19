import { useState, type FormEvent } from "react";
import { api, errorText, text, type Row } from "../../../shared/api";
import { Dialog } from "../../../shared/Dialog";
import { useUnsavedChanges } from "../../../shared/useUnsavedChanges";
import { Button } from "../../../shared/ui/Button";
import { InputField, SelectField } from "../../../shared/ui/Field";
import { Feedback } from "../../../shared/ui/Feedback";

export function GroupStatusModal({
  group,
  onClose,
  onUpdated,
}: {
  group: Row;
  onClose: () => void;
  onUpdated: () => Promise<void>;
}) {
  const [state, setState] = useState(text(group, "estado"));
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState(false);
  const unsaved = useUnsavedChanges(
    state !== text(group, "estado") || !!reason,
    busy,
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reason.trim()) {
      setError("Describe el motivo del cambio.");
      return;
    }
    if (state === text(group, "estado")) {
      setError("Selecciona un estado diferente.");
      return;
    }
    if (!review) {
      setReview(true);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(`oferta/grupos/${group.id}`, {
        method: "PATCH",
        body: { estado: state, motivo: reason.trim() },
      });
      await onUpdated();
    } catch (cause) {
      setError(errorText(cause));
      setReview(false);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Dialog
        title={`Estado del salón ${text(group, "codigo")}`}
        onClose={() => unsaved.request(onClose)}
        busy={busy}
        className="academic-status-dialog"
      >
        <form onSubmit={submit} className="group-form-flow">
          <p className="muted">
            Actualiza la disponibilidad del salón. El motivo queda registrado en
            su historial.
          </p>
          <SelectField
            id="group-state"
            label="Estado del grupo"
            value={state}
            disabled={busy || review}
            onChange={(event) => {
              setState(event.target.value);
              setReview(false);
            }}
          >
            <option value="PLANIFICADO">Planificado</option>
            <option value="ACTIVO">Activo</option>
            <option value="CERRADO">Cerrado</option>
          </SelectField>
          <InputField
            id="group-state-reason"
            label="Motivo del cambio"
            value={reason}
            required
            maxLength={500}
            disabled={busy || review}
            onChange={(event) => {
              setReason(event.target.value);
              setReview(false);
            }}
          />
          {review && (
            <Feedback tone="notice">
              Confirma el cambio de {text(group, "estado")} a {state}.{" "}
              {state === "CERRADO" &&
                "El salón quedará disponible para consulta de su historial académico."}
            </Feedback>
          )}
          <Feedback>{error}</Feedback>
          <footer className="actions">
            <Button
              disabled={busy}
              onClick={
                review ? () => setReview(false) : () => unsaved.request(onClose)
              }
            >
              {review ? "Volver a editar" : "Cancelar"}
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy
                ? "Guardando…"
                : review
                  ? "Confirmar estado"
                  : "Revisar cambio"}
            </Button>
          </footer>
        </form>
      </Dialog>
      {unsaved.confirmation}
    </>
  );
}
