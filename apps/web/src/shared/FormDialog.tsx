import { useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { Dialog } from "./Dialog";
import { useUnsavedChanges } from "./useUnsavedChanges";
import { Button } from "./ui/Button";
import { Feedback } from "./ui/Feedback";

/** Formulario con revisión y protección de la captura compartidas entre acciones. */
export function FormDialog({
  title,
  context,
  children,
  reviewContent,
  review,
  reviewLabel,
  confirmLabel,
  busy,
  dirty,
  blocked = false,
  error,
  onClose,
  onBack,
  onSubmit,
  onReload,
  reloadLabel = "Recargar registro",
}: {
  title: string;
  context?: ReactNode;
  children: ReactNode;
  reviewContent: ReactNode;
  review: boolean;
  reviewLabel: string;
  confirmLabel: string;
  busy: boolean;
  dirty: boolean;
  blocked?: boolean;
  error: string;
  onClose: () => void;
  onBack: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onReload?: () => void;
  reloadLabel?: string;
}) {
  const guard = useUnsavedChanges(dirty, busy);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (review) reviewHeading.current?.focus();
  }, [review]);
  return (
    <>
      <Dialog title={title} onClose={() => guard.request(onClose)} busy={busy}>
        <form noValidate onSubmit={onSubmit}>
          {context}
          {review ? (
            <section className="review">
              <h3 ref={reviewHeading} tabIndex={-1}>
                {confirmLabel}
              </h3>
              {reviewContent}
            </section>
          ) : (
            children
          )}
          <Feedback>{error}</Feedback>
          {onReload && (
            <>
              <p className="notice">
                La captura se conserva. Recarga el registro para consultar su
                estado vigente antes de continuar.
              </p>
              <Button disabled={busy} onClick={() => guard.request(onReload)}>
                {reloadLabel}
              </Button>
            </>
          )}
          <footer className="actions">
            <Button
              disabled={busy}
              onClick={review ? onBack : () => guard.request(onClose)}
            >
              {review ? "Volver a editar" : "Cancelar"}
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={blocked}
              busy={busy}
              busyLabel="Guardando…"
            >
              {review ? confirmLabel : reviewLabel}
            </Button>
          </footer>
        </form>
      </Dialog>
      {guard.confirmation}
    </>
  );
}
