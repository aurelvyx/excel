import { useCallback, useEffect, useState } from "react";
import { api, errorText } from "./api";

/** Consultas GET locales: cancela al cambiar de ruta y descarta respuestas antiguas. */
export function useApiQuery<T>(path: string) {
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<{
    path: string;
    version: number;
    data?: T;
    error: string;
  }>();
  useEffect(() => {
    const abort = new AbortController();
    void api<T>(path, { signal: abort.signal })
      .then((data) => {
        if (!abort.signal.aborted)
          setResult({ path, version, data, error: "" });
      })
      .catch((error) => {
        if (!abort.signal.aborted)
          setResult({ path, version, error: errorText(error) });
      });
    return () => abort.abort();
  }, [path, version]);
  const reload = useCallback(() => setVersion((value) => value + 1), []);
  const loading = result?.path !== path || result.version !== version;
  return {
    data: result?.data,
    error: loading ? "" : (result?.error ?? ""),
    loading,
    reload,
  };
}
