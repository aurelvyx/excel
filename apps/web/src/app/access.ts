import { resources } from "../features/configuration/model";
import type { Resource } from "../shared/form-types";

/**
 * Capacidades de navegación derivadas de los roles de la sesión.
 * Solo gobierna qué muestra la interfaz: la API vuelve a validar rol y
 * propiedad del grupo en cada petición.
 */
export interface Access {
  admin: boolean;
  /** Administrador, secretaría o coordinación: consulta el catálogo completo. */
  reader: boolean;
  /** Docente sin ningún rol administrativo: solo ve sus grupos. */
  teacherOnly: boolean;
  /** Registra vouchers y matrículas. */
  enrollments: boolean;
  reports: boolean;
  /** Catálogos de oferta visibles para el usuario. */
  catalogs: Resource[];
  /** Prefijo de ruta del catálogo: edición (admin) o consulta. */
  catalogBase: string;
}

export function accessFor(roles: string[]): Access {
  const has = (...names: string[]) => roles.some((r) => names.includes(r));
  const admin = has("ADMIN");
  const reader = has("ADMIN", "SECRETARIA", "COORDINADOR");
  return {
    admin,
    reader,
    teacherOnly: has("DOCENTE") && !reader,
    enrollments: has("ADMIN", "SECRETARIA"),
    reports: has("ADMIN", "COORDINADOR", "DOCENTE"),
    catalogs: Object.values(resources).filter(
      (resource) =>
        admin ||
        (reader && !["docentes", "usuarios"].includes(resource.key)) ||
        (!reader && resource.key === "grupos"),
    ),
    catalogBase: admin ? "/configuracion" : "/consulta",
  };
}

/** Ruta de un catálogo: los docentes solo llegan a «Mis grupos». */
export const catalogUrl = (access: Access, key: string) =>
  access.reader ? `${access.catalogBase}/${key}` : "/mis-grupos/grupos";
