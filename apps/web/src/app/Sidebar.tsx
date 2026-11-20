import { Brand } from "../features/auth/Auth";
import type { Access } from "./access";
import { navGroups } from "./navigation-groups";

export function Sidebar({
  access,
  path,
  expanded,
  onNavigate,
}: {
  access: Access;
  path: string;
  expanded: boolean;
  onNavigate: () => void;
}) {
  return (
    <aside className={`sidebar ${expanded ? "expanded" : ""}`}>
      <Brand />
      <nav aria-label="Navegación principal" onClick={onNavigate}>
        <a href="#/" aria-current={path === "/" ? "page" : undefined}>
          <span aria-hidden="true">⌂</span> Inicio
        </a>
        {navGroups(access, path).map((group) => (
          <div key={group.label} role="group" aria-label={group.label}>
            <p className="nav-label">{group.label}</p>
            {group.items.map((item) => (
              <a
                key={item.href}
                href={item.href}
                aria-current={item.current(path) ? "page" : undefined}
              >
                {item.label}
              </a>
            ))}
          </div>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <span className="status-dot" />
        Gestión académica<small>Centro de Idiomas Excel</small>
      </div>
    </aside>
  );
}
