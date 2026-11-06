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
export function navGroups(access: Access, path: string): NavGroup[] {
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
    access.enrollments && {
      href: "#/matriculas",
      label: "Matrículas",
      current: (p) => /^\/matriculas(?:\/nueva|\/[0-9]+)?$/.test(p),
    },
    access.reader && {
      href: "#/matriculas/padron",
      label: "Nóminas por grupo",
      current: (p) => p === "/matriculas/padron" || p.startsWith("/matriculas/grupo/"),
    },
    access.reader && {
      href: "#/estudiantes",
      label: "Estudiantes",
      current: starts("/estudiantes"),
    },
    access.enrollments && {
      href: "#/vouchers",
      label: "Vouchers",
      current: exact("/vouchers"),
    },
  ]);

  add("Docencia", [
    access.teacherOnly && {
      href: "#/docencia/clases",
      label: "Mis clases asignadas",
      current: exact("/docencia/clases"),
    },
    access.teacherOnly && {
      href: "#/docencia/asistencias",
      label: "Asistencias",
      current: exact("/docencia/asistencias"),
    },
    access.teacherOnly && {
      href: "#/docencia/calificaciones",
      label: "Calificaciones de mis grupos",
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
    access.reader && {
      href: `#${catalogUrl(access, "grupos")}`,
      label: "Grupos",
      current: isCatalog("grupos"),
    },
    access.reader && {
      href: `#${catalogUrl(access, "secciones")}`,
      label: "Secciones",
      current: isCatalog("secciones"),
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
    {
      href: "#/evaluacion/niveles",
      label: "Criterios de evaluación",
      current: (p) => p.startsWith("/evaluacion/niveles") || p.startsWith("/evaluacion/planes"),
    },
    (access.admin || access.reader) && {
      href: "#/actas",
      label: "Actas de Cierre por Salón",
      current: starts("/actas"),
    },
    access.reports && {
      href: "#/reportes",
      label: "Reportes",
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
      {
        href: "#/respaldos",
        label: "Respaldos",
        current: exact("/respaldos"),
      },
    ]);
  }

  return groups;
}
