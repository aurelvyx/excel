import type { ReactNode } from "react";
import { Feedback } from "./Feedback";

/** Estructura visual compartida; filtros, filas y permisos pertenecen a cada página. */
export function ListPanel({
  filters,
  loading,
  loadingLabel,
  error,
  onRetry,
  empty,
  emptyDescription,
  children,
  pagination,
}: {
  filters?: ReactNode;
  loading: boolean;
  loadingLabel: string;
  error: string;
  onRetry: () => void;
  empty: boolean;
  emptyDescription: ReactNode;
  children: ReactNode;
  pagination: ReactNode;
}) {
  return (
    <div className="panel">
      {filters}
      {loading ? (
        <div className="empty" role="status">
          {loadingLabel}
        </div>
      ) : error ? (
        <div className="empty">
          <Feedback onRetry={onRetry}>{error}</Feedback>
        </div>
      ) : empty ? (
        <div className="empty">
          <span className="empty-icon" aria-hidden="true">
            □
          </span>
          <h2>No hay registros para mostrar</h2>
          <p>{emptyDescription}</p>
        </div>
      ) : (
        children
      )}
      {!loading && !error && pagination}
    </div>
  );
}
