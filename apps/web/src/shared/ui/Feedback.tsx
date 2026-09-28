import type { ReactNode } from "react";
import { Button } from "./Button";

export function Feedback({
  children,
  tone = "error",
  onRetry,
  retryLabel = "Reintentar",
}: {
  children: ReactNode;
  tone?: "error" | "success" | "notice";
  onRetry?: () => void;
  retryLabel?: string;
}) {
  if (!children) return null;
  return (
    <div className={tone} role={tone === "error" ? "alert" : "status"}>
      {children}
      {onRetry && (
        <>
          {" "}
          <Button onClick={onRetry}>{retryLabel}</Button>
        </>
      )}
    </div>
  );
}
export function Loading({ children }: { children: ReactNode }) {
  return <p role="status">{children}</p>;
}
