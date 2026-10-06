import { useSyncExternalStore } from "react";
export const routeChangeEvent = "excel-route-change";
const subscribe = (listener: () => void) => {
  function changed(event: HashChangeEvent) {
    const request = new CustomEvent(routeChangeEvent, {
      cancelable: true,
      detail: event,
    });
    // El formulario decide antes de notificar el nuevo snapshot al router.
    if (window.dispatchEvent(request)) listener();
  }
  window.addEventListener("hashchange", changed);
  return () => window.removeEventListener("hashchange", changed);
};
export function useRoute() {
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash.slice(1) || "/",
  );
  const [path, query] = hash.split("?");
  return { path, query: new URLSearchParams(query) };
}
export const navigate = (path: string) => {
  window.location.hash = path;
};
