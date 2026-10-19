import type { ReactNode } from "react";

export function StatusBadge({
  inactive = false,
  children,
}: {
  inactive?: boolean;
  children: ReactNode;
}) {
  return (
    <span className={`badge${inactive ? " inactive" : ""}`}>{children}</span>
  );
}
