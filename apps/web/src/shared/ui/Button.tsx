import type { ComponentProps, ReactNode } from "react";

type ButtonProps = ComponentProps<"button"> & {
  variant?: "default" | "primary" | "quiet" | "link";
  busy?: boolean;
  busyLabel?: ReactNode;
};

export function Button({
  type = "button",
  variant = "default",
  busy = false,
  busyLabel,
  disabled,
  className = "",
  children,
  ...props
}: ButtonProps) {
  const style =
    variant === "link" ? "link-button" : variant === "default" ? "" : variant;
  return (
    <button
      {...props}
      type={type}
      className={[style, className].filter(Boolean).join(" ") || undefined}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
    >
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
}
