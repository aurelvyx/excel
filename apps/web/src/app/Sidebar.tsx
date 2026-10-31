import { Brand } from "../features/auth/Auth";
import { catalogUrl, type Access } from "./access";

interface NavItem {
  href: string;
  label: string;
  /** Marca el enlace como actual cuando la ruta cumple la condición. */
  current: (path: string) => boolean;
}
interface NavGroup {
  label: string;
  items: NavItem[];
}

const starts = (prefix: string) => (path: string) => path.startsWith(prefix);
const exact = (value: string) => (path: string) => path === value;

/** Menú agrupado por tarea y flujo de trabajo administrativo. */
function navGroups(access: Access, path: string): NavGroup[] {
  const groups: NavGroup[] = [];
  const add = (label: string, items: (NavItem | false | undefined | null)[]) => {
    const visible = items.filter((i): i is NavItem => !!i);
    if (visible.length) groups.push({ label, items: visible });
  };

  const selected = path.split("/")[2];
  const isCatalog = (key: string) => (p: string) =>
    selected === key &&
    (p.startsWith(`${access.catalogBase}/`) || p === "/mis-grupos/grupos");
  const isClassCatalog = (p: string) =>
    isCatalog("grupos")(p) || isCatalog("secciones")(p);

  add("Matrícula", [
    access.reader && {
      href: "#/matriculas",
      label: "Matrículas",
      current: starts("/matriculas"),
    },
    access.enrollments && {
      href: "#/vouchers",
      label: "Vouchers",
      current: exact("/vouchers"),
    },
  ]);

  add("Docencia", [
    access.teacherOnly && {
      href: "#/docencia/asistencias",
      label: "Asistencias",
      current: exact("/docencia/asistencias"),
    },
    access.teacherOnly && {
      href: "#/docencia/calificaciones",
      label: "Calificaciones",
      current: exact("/docencia/calificaciones"),
    },
  ]);

  add(access.teacherOnly ? "Mis Grupos" : "Gestión Académica", [
    access.reader && {
      href: "#/gestion-academica",
      label: "Salones y Programas",
      current: exact("/gestion-academica"),
    },
    access.teacherOnly && {
      href: `#${catalogUrl(access, "grupos")}`,
      label: "Mis grupos",
      current: isClassCatalog,
    },
  ]);

  if (access.reader) {
    add("Preparación de Ciclo", [
      {
        href: `#${catalogUrl(access, "periodos")}`,
        label: "Periodos académicos",
        current: isCatalog("periodos"),
      },
      {
        href: `#${catalogUrl(access, "turnos")}`,
        label: "Turnos y horarios",
        current: isCatalog("turnos"),
      },
    ]);

    add("Oferta Académica", [
      {
        href: "#/matriz-curricular",
        label: "Matriz curricular",
        current: exact("/matriz-curricular"),
      },
      {
        href: `#${catalogUrl(access, "idiomas")}`,
        label: "Idiomas",
        current: isCatalog("idiomas"),
      },
      {
        href: `#${catalogUrl(access, "niveles")}`,
        label: "Niveles",
        current: isCatalog("niveles"),
      },
      {
        href: `#${catalogUrl(access, "unidades")}`,
        label: "Unidades didácticas",
        current: isCatalog("unidades"),
      },
    ]);
  }

  add("Cierre Académico y Actas", [
    (access.admin || access.reader) && {
      href: "#/actas",
      label: "Actas de Cierre por Salón",
      current: starts("/actas"),
    },
    access.reports && {
      href: "#/reportes",
      label: "Reportes y Matrices PDF",
      current: starts("/reportes"),
    },
  ]);

  if (access.admin) {
    add("Administración", [
      {
        href: `#${catalogUrl(access, "docentes")}`,
        label: "Docentes",
        current: isCatalog("docentes"),
      },
      {
        href: `#${catalogUrl(access, "usuarios")}`,
        label: "Usuarios y roles",
        current: isCatalog("usuarios"),
      },
    ]);
  }

  return groups;
}

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
