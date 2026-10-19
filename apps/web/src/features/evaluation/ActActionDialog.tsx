import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { ApiError, errorText } from "../../shared/api";
import { FormDialog } from "../../shared/FormDialog";
import { InputField, TextAreaField } from "../../shared/ui/Field";

type ActionFields = {
  busy: boolean;
  blocked: boolean;
  issues: Record<string, string>;
  clearIssue: (key: string) => void;
};
/** Revisión, motivo, confirmación y conflictos compartidos por las acciones del acta. */
export function ActActionDialog({
  title,
  context,
  children,
  reviewContent,
  consequence,
  correction = false,
  captureDirty = false,
  validate,
  onConfirm,
  onClose,
  onConflict,
  onReload,
}: {
  title: string;
  context: ReactNode;
  children?: (state: ActionFields) => ReactNode;
  reviewContent: ReactNode;
  consequence: string;
  correction?: boolean;
  captureDirty?: boolean;
  validate?: () => Record<string, string>;
  onConfirm: (reason: string | null) => Promise<void>;
  onClose: () => void;
  onConflict: () => void;
  onReload: () => void;
}) {
  const [reason, setReason] = useState("");
  const [acknowledged, acknowledge] = useState(false);
  const [review, confirm] = useState(false);
  const [busy, pending] = useState(false);
  const [blocked, block] = useState(false);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [error, fail] = useState("");
  const submitting = useRef(false);
  const clearIssue = (key: string) =>
    setIssues((current) => ({ ...current, [key]: "" }));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || blocked) return;
    const next = { ...validate?.() };
    if (correction && !reason.trim())
      next.reason = "Indica el motivo de la corrección.";
    else if (reason.trim().length > 400)
      next.reason = "El motivo admite hasta 400 caracteres.";
    if (!acknowledged)
      next.acknowledged = "Confirma que revisaste los datos y la consecuencia.";
    setIssues(next);
    if (Object.keys(next).length) {
      const form = event.currentTarget;
      setTimeout(
        () => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
        0,
      );
      return;
    }
    if (!review) {
      confirm(true);
      return;
    }
    submitting.current = true;
    pending(true);
    fail("");
    try {
      await onConfirm(reason.trim() || null);
    } catch (error) {
      fail(errorText(error));
      confirm(false);
      if (error instanceof ApiError && [403, 409].includes(error.status)) {
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
      title={title}
      context={context}
      review={review}
      reviewLabel={correction ? "Revisar corrección" : "Revisar cierre de acta"}
      confirmLabel={
        correction ? "Confirmar corrección" : "Confirmar cierre de acta"
      }
      reviewContent={
        <>
          {reviewContent}
          <p>Motivo: {reason.trim() || "Sin motivo adicional"}</p>
          <p className="notice">{consequence}</p>
        </>
      }
      busy={busy}
      dirty={captureDirty || Boolean(reason || acknowledged || blocked)}
      blocked={blocked}
      error={error}
      onClose={onClose}
      onBack={() => confirm(false)}
      onSubmit={(event) => void submit(event)}
      onReload={blocked ? onReload : undefined}
      reloadLabel="Recargar acta"
    >
      {children?.({ busy, blocked, issues, clearIssue })}
      <TextAreaField
        label={
          correction ? "Motivo de corrección" : "Motivo del cierre de acta"
        }
        value={reason}
        rows={3}
        maxLength={400}
        required={correction}
        disabled={busy || blocked}
        error={issues.reason}
        hint={`${correction ? "Obligatorio" : "Opcional"} · máximo 400 caracteres.`}
        onChange={(event) => {
          setReason(event.target.value);
          clearIssue("reason");
        }}
      />
      <InputField
        type="checkbox"
        label="Confirmo que revisé los datos y la consecuencia de esta acción"
        checked={acknowledged}
        required
        disabled={busy || blocked}
        error={issues.acknowledged}
        onChange={(event) => {
          acknowledge(event.target.checked);
          clearIssue("acknowledged");
        }}
      />
    </FormDialog>
  );
}
