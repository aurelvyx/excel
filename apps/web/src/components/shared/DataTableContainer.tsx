import type { ReactNode } from "react";
import { Feedback } from "../../shared/ui/Feedback";

export function DataTableContainer({
  statusLeft,
  statusRight,
  filters,
  loading = false,
  loadingLabel = "Cargando registros…",
  error = "",
  onRetry,
  empty = false,
  emptyTitle = "No hay registros para mostrar",
  emptyDescription,
  pagination,
  children,
}: {
  statusLeft?: ReactNode;
  statusRight?: ReactNode;
  filters?: ReactNode;
  loading?: boolean;
  loadingLabel?: string;
  error?: string;
  onRetry?: () => void;
  empty?: boolean;
  emptyTitle?: string;
  emptyDescription?: ReactNode;
  pagination?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="ds-table-card">
      {filters}
      {(statusLeft || statusRight) && !loading && !error && (
        <div className="ds-table-statusbar">
          <div>{statusLeft}</div>
          <div>{statusRight}</div>
        </div>
      )}
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
          <h2>{emptyTitle}</h2>
          {emptyDescription && <p>{emptyDescription}</p>}
        </div>
      ) : (
        children
      )}
      {!loading && !error && pagination}
    </section>
  );
}

