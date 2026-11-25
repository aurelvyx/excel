import { useCallback, useEffect, useState } from "react";
import { api, errorText } from "./api";

function get<T>(path: string, signal: AbortSignal) {
  return api<T>(path, { signal });
}

/** Consultas GET locales: cancela al cambiar de ruta y descarta respuestas antiguas. */
export function useApiQuery<T>(
  path: string,
  load: (path: string, signal: AbortSignal) => Promise<T> = get<T>,
) {
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<{
    path: string;
    version: number;
    data?: T;
    error: string;
  }>();
  useEffect(() => {
    const abort = new AbortController();
    void load(path, abort.signal)
      .then((data) => {
        if (!abort.signal.aborted)
          setResult({ path, version, data, error: "" });
      })
      .catch((error) => {
        if (!abort.signal.aborted)
          setResult({ path, version, error: errorText(error) });
      });
    return () => abort.abort();
  }, [path, version, load]);
  const reload = useCallback(() => setVersion((value) => value + 1), []);
  const current = result?.path === path ? result : undefined;
  const loading = current?.version !== version;
  return {
    data: current?.data,
    error: loading ? "" : (current?.error ?? ""),
    loading,
    reload,
  };
}
