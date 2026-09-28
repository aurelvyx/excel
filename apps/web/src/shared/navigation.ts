import { useSyncExternalStore } from "react";
const subscribe = (listener: () => void) => {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
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
