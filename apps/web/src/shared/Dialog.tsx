import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "./ui/Button";
export function Dialog({
  title,
  children,
  onClose,
  busy = false,
  className,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => {
      dialog.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={className}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header className="dialog-header">
        <h2 id={titleId}>{title}</h2>
        <Button
          type="button"
          disabled={busy}
          aria-label="Cerrar formulario"
          onClick={onClose}
        >
          ×
        </Button>
      </header>
      {children}
    </dialog>
  );
}
