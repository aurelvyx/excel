import { useRef, useState, type FormEvent } from "react";
import { ApiError, api, errorText } from "../../shared/api";
import { FormDialog } from "../../shared/FormDialog";
import { Facts } from "../../shared/ui/Facts";
import { InputField, SelectField, TextAreaField } from "../../shared/ui/Field";
import { DefinitionView } from "./EvaluationDefinition";
import {
  formulaLabel,
  type EvaluationPlan,
  type EvaluationUnit,
} from "./model";

/** La aprobación y la aplicación comparten revisión, confirmación y conflicto. */
export function EvaluationActionDialog<T>({
  kind,
  endpoint,
  plan,
  choices = [],
  units = [],
  onClose,
  onSaved,
  onConflict,
  onReload,
}: {
  kind: "approve" | "apply";
  endpoint: string;
  plan?: EvaluationPlan;
  choices?: EvaluationPlan[];
  units?: EvaluationUnit[];
  onClose: () => void;
  onSaved: (value: T) => void;
  onConflict: () => void;
  onReload: () => void;
}) {
  const approving = kind === "approve";
  const [selected, select] = useState("");
  const [reference, setReference] = useState("");
  const [accepted, accept] = useState(false);
  const [attempted, attempt] = useState(false);
  const [review, setReview] = useState(false);
  const [busy, pending] = useState(false);
  const [conflict, block] = useState(false);
  const [error, fail] = useState("");
  const submitting = useRef(false);
  const chosen = approving
    ? plan
    : choices.find((entry) => entry.id === selected);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || conflict) return;
    attempt(true);
    if (!chosen || (approving && !reference.trim()) || !accepted) {
      fail("Completa los campos y confirma la decisión antes de continuar.");
      return;
    }
    if (!review) {
      setReview(true);
      fail("");
      return;
    }
    submitting.current = true;
    pending(true);
    fail("");
    try {
      onSaved(
        await api<T>(endpoint, {
          method: "POST",
          body: approving
            ? {
                revision: chosen.revision,
                referenciaAprobacion: reference.trim(),
                confirmado: true,
              }
            : { planId: chosen.id, confirmado: true },
        }),
      );
    } catch (e) {
      fail(errorText(e));
      setReview(false);
      if (e instanceof ApiError && e.status === 409) {
        block(true);
        onConflict();
      }
    } finally {
      submitting.current = false;
      pending(false);
    }
  }
  return (
    <FormDialog
      title={approving ? "Aprobar versión" : "Aplicar versión aprobada"}
      review={review}
      reviewLabel={approving ? "Revisar aprobación" : "Revisar aplicación"}
      confirmLabel={approving ? "Confirmar aprobación" : "Confirmar aplicación"}
      reviewContent={
        <>
          <Facts
            items={[
              ["Versión", chosen ? `${chosen.version} · ${chosen.nombre}` : ""],
              ["Fórmula", formulaLabel],
              ...(approving
                ? [["Referencia de aprobación", reference.trim()] as const]
                : []),
            ]}
          />
          {chosen && <DefinitionView value={chosen.estructura} units={units} />}
          <p className="notice">
            {approving
              ? "La versión aprobada quedará inmutable. Una modificación posterior requiere otra versión."
              : "Se conservará una copia de estos criterios para el grupo. No podrá sustituirse por otra versión ni editarse después de aplicar."}
          </p>
        </>
      }
      busy={busy}
      dirty={Boolean(reference || selected || accepted || conflict)}
      blocked={conflict}
      error={error}
      onClose={onClose}
      onBack={() => setReview(false)}
      onSubmit={(event) => void submit(event)}
      onReload={conflict ? onReload : undefined}
      reloadLabel={approving ? "Recargar versión" : "Recargar configuración"}
    >
      {approving ? (
        <TextAreaField
          label="Referencia de aprobación"
          value={reference}
          required
          maxLength={400}
          rows={3}
          hint="Identifica el documento o acuerdo del centro que aprueba estos criterios."
          error={
            attempted && !reference.trim()
              ? "Indica la referencia de aprobación."
              : undefined
          }
          disabled={busy || conflict}
          onChange={(event) => setReference(event.target.value)}
        />
      ) : (
        <SelectField
          label="Versión aprobada"
          value={selected}
          required
          error={
            attempted && !selected
              ? "Selecciona una versión aprobada."
              : undefined
          }
          disabled={busy || conflict}
          onChange={(event) => select(event.target.value)}
        >
          <option value="">Selecciona una versión</option>
          {choices.map((entry) => (
            <option key={entry.id} value={entry.id}>
              Versión {entry.version} · {entry.nombre}
            </option>
          ))}
        </SelectField>
      )}
      {chosen && !approving && (
        <DefinitionView value={chosen.estructura} units={units} />
      )}
      <InputField
        label={
          approving
            ? "Confirmo que el centro aprobó estos criterios"
            : "Confirmo que estos criterios corresponden al grupo"
        }
        type="checkbox"
        checked={accepted}
        required
        disabled={busy || conflict}
        error={attempted && !accepted ? "Confirma la decisión." : undefined}
        onChange={(event) => accept(event.target.checked)}
      />
    </FormDialog>
  );
}
