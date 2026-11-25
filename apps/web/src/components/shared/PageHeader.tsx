import type { ReactNode } from "react";

export interface SubnavTab {
  key: string;
  label: string;
  href: string;
  active?: boolean;
}

export interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  eyebrow?: string;
  statusPill?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  variant?: "hero" | "surface";
  subnavTabs?: SubnavTab[];
  subnavMeta?: ReactNode;
}

export function PageHeader({
  title,
  description,
  eyebrow,
  statusPill,
  icon,
  actions,
  variant = "hero",
  subnavTabs,
  subnavMeta,
}: PageHeaderProps) {
  return (
    <>
      {subnavTabs && subnavTabs.length > 0 && (
        <div className="ds-subnav">
          <div
            className="ds-subnav-tabs"
            role="tablist"
            aria-label="Navegación de sección"
          >
            {subnavTabs.map((tab) => (
              <a
                key={tab.key}
                href={tab.href}
                className={`ds-subnav-tab ${tab.active ? "is-active" : ""}`}
                aria-current={tab.active ? "page" : undefined}
              >
                {tab.label}
              </a>
            ))}
          </div>
          {subnavMeta && <div className="ds-subnav-meta">{subnavMeta}</div>}
        </div>
      )}

      <header className={`page-heading ds-header ds-header--${variant}`}>
        <div className="ds-header-left">
          {icon && (
            <div className="ds-header-icon" aria-hidden="true">
              {icon}
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            {(eyebrow || statusPill) && (
              <div className="ds-header-title-row">
                {eyebrow && <p className="ds-header-eyebrow">{eyebrow}</p>}
                {statusPill && (
                  <span className="ds-header-pill">{statusPill}</span>
                )}
              </div>
            )}
            <h1>{title}</h1>
            {description && <p className="ds-header-desc">{description}</p>}
          </div>
        </div>
        {actions && <div className="ds-header-actions">{actions}</div>}
      </header>
    </>
  );
}

