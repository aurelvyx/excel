import { useEffect, useRef, useState } from "react";
import { Dialog } from "./Dialog";
import { Button } from "./ui/Button";
import { navigate, routeChangeEvent } from "./navigation";

const exitEvent = "excel-request-page-exit";
/** Acciones fuera del formulario, como cerrar sesión, respetan su captura pendiente. */
export function requestPageExit(action: () => void) {
  if (
    window.dispatchEvent(
      new CustomEvent(exitEvent, { cancelable: true, detail: action }),
    )
  )
    action();
}
type PendingAction = { run: () => void; navigation: boolean };

/** Conserva la captura al navegar, recargar o volver con cambios sin guardar. */
export function useUnsavedChanges(dirty: boolean, busy = false) {
  const [pending, setPending] = useState<PendingAction | null>(null);
  const allowNavigation = useRef(false);
  if (!dirty && pending) setPending(null);
  function request(action: () => void, navigation = false) {
    if (busy) return;
    if (dirty) setPending({ run: action, navigation });
    else action();
  }
  useEffect(() => {
    if (!dirty && !busy) return;
    function click(event: MouseEvent) {
      if (
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link =
        event.target instanceof Element ? event.target.closest("a") : null;
      const href = link?.getAttribute("href");
      if (
        !href?.startsWith("#/") ||
        link?.target === "_blank" ||
        href === window.location.hash
      )
        return;
      event.preventDefault();
      if (!busy)
        setPending({ run: () => navigate(href.slice(1)), navigation: true });
    }
    function hash(request: Event) {
      if (allowNavigation.current) {
        allowNavigation.current = false;
        return;
      }
      const event = (request as CustomEvent<HashChangeEvent>).detail;
      const destination = new URL(event.newURL).hash.slice(1) || "/";
      // La ruta se conserva antes de que el router renderice la nueva pantalla.
      history.replaceState(history.state, "", event.oldURL);
      request.preventDefault();
      if (!busy)
        setPending({ run: () => navigate(destination), navigation: true });
    }
    function unload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    function exit(event: Event) {
      const action = (event as CustomEvent<() => void>).detail;
      if (typeof action !== "function") return;
      event.preventDefault();
      if (!busy) setPending({ run: action, navigation: false });
    }
    document.addEventListener("click", click, true);
    window.addEventListener(routeChangeEvent, hash);
    window.addEventListener("beforeunload", unload);
    window.addEventListener(exitEvent, exit);
    return () => {
      document.removeEventListener("click", click, true);
      window.removeEventListener(routeChangeEvent, hash);
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener(exitEvent, exit);
    };
  }, [dirty, busy]);
  return {
    request,
    confirmation: pending && (
      <Dialog title="Descartar cambios" onClose={() => setPending(null)}>
        <p>
          Hay cambios sin guardar. Si continúas, se descartará la captura de
          esta página.
        </p>
        <footer className="actions">
          <Button onClick={() => setPending(null)}>Seguir editando</Button>
          <Button
            variant="primary"
            onClick={() => {
              allowNavigation.current = pending.navigation;
              setPending(null);
              pending.run();
            }}
          >
            Descartar y continuar
          </Button>
        </footer>
      </Dialog>
    ),
  };
}
