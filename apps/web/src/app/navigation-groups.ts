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

/** Menú agrupado simplificado por flujo de trabajo administrativo y docente. */
export function navGroups(access: Access, path: string): NavGroup[] {
  const groups: NavGroup[] = [];
  const add = (
    label: string,
    items: (NavItem | false | undefined | null)[],
  ) => {
    const visible = items.filter((i): i is NavItem => !!i);
    if (visible.length) groups.push({ label, items: visible });
  };

  const selected = path.split("/")[2];
  const isCatalog = (key: string) => (p: string) =>
    selected === key &&
    (p.startsWith(`${access.catalogBase}/`) || p === "/mis-grupos/grupos");

  if (access.teacherOnly) {
    add("Mi Trabajo Docente", [
      {
        href: "#/docencia/clases",
        label: "Mis clases asignadas",
        current: (p) =>
          starts("/docencia")(p) ||
          starts("/mis-grupos")(p) ||
          starts("/asistencia/")(p) ||
          starts("/evaluacion/")(p) ||
          starts("/salones/")(p),
      },
    ]);
    return groups;
  }

  add("Gestión Académica", [
    access.reader && {
      href: "#/gestion-academica",
      label: "Gestión Académica",
      current: starts("/gestion-academica"),
    },
    access.reader && {
      href: "#/matriz-curricular",
      label: "Matriz curricular",
      current: exact("/matriz-curricular"),
    },
  ]);

  add("Alumnos y Matrícula", [
    access.reader && {
      href: "#/matriculas",
      label: "Gestión de matrículas",
      current: starts("/matriculas"),
    },
    access.enrollments && {
      href: "#/vouchers",
      label: "Comprobantes de pago (Vouchers)",
      current: exact("/vouchers"),
    },
    access.reader && {
      href: "#/estudiantes",
      label: "Padrón de estudiantes",
      current: starts("/estudiantes"),
    },
  ]);

  add("Cierre Académico y Actas", [
    (access.admin || access.reader) && {
      href: "#/actas",
      label: "Actas de Cierre por Salón",
      current: (p) => starts("/actas")(p) || starts("/evaluacion/grupos")(p),
    },
    access.reports && {
      href: "#/reportes",
      label: "Reportes y Matrices",
      current: starts("/reportes"),
    },
  ]);

  if (access.admin || access.reader) {
    add("Configuración y Catálogos", [
      access.admin && {
        href: `#${catalogUrl(access, "docentes")}`,
        label: "Plana docente",
        current: isCatalog("docentes"),
      },
      access.reader && {
        href: `#${catalogUrl(access, "periodos")}`,
        label: "Periodos académicos",
        current: isCatalog("periodos"),
      },
      access.reader && {
        href: `#${catalogUrl(access, "turnos")}`,
        label: "Turnos y horarios",
        current: isCatalog("turnos"),
      },
      access.reader && {
        href: `#${catalogUrl(access, "idiomas")}`,
        label: "Idiomas y niveles",
        current: (p) => isCatalog("idiomas")(p) || isCatalog("niveles")(p),
      },
      access.admin && {
        href: `#${catalogUrl(access, "usuarios")}`,
        label: "Usuarios y roles",
        current: isCatalog("usuarios"),
      },
    ]);
  }

  if (access.auditLogs) {
    add("Administración y Seguridad", [
      {
        href: "#/auditoria",
        label: "Historial de Modificaciones",
        current: starts("/auditoria"),
      },
    ]);
  }

  return groups;
}
