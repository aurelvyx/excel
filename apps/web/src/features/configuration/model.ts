import { text, type Row } from "../../shared/api";
export type Field = {
  key: string;
  label: string;
  source?: string;
  type?:
    | "text"
    | "number"
    | "date"
    | "time"
    | "email"
    | "password"
    | "select"
    | "roles";
  required?: boolean;
  max?: number;
  min?: number;
  pattern?: string;
  options?: string[];
  reference?: string;
  immutable?: boolean;
  nullable?: boolean;
  createOnly?: boolean;
  editOnly?: boolean;
  hint?: string;
};
export type Resource = {
  key: string;
  title: string;
  singular: string;
  path: string;
  description: string;
  fields: Field[];
  columns: string[];
  filters?: Field[];
};
export const roleNames: Record<string, string> = {
  ADMIN: "Administrador",
  SECRETARIA: "Secretaría",
  DOCENTE: "Docente",
  COORDINADOR: "Coordinación",
};
export const labels: Record<string, string> = {
  ...roleNames,
  PLANIFICADO: "Planificado",
  ABIERTO: "Abierto",
  CERRADO: "Cerrado",
  ACTIVO: "Activo",
  true: "Activo",
  false: "Inactivo",
};
const name: Field = { key: "nombre", label: "Nombre", required: true, max: 80 };
const code = (max = 20): Field => ({
  key: "codigo",
  label: "Código",
  required: true,
  max,
});
const active: Field = {
  key: "activo",
  label: "Estado",
  type: "select",
  options: ["true", "false"],
  editOnly: true,
};
const order: Field = {
  key: "orden",
  label: "Orden",
  type: "number",
  required: true,
  min: 1,
  max: 32767,
};
const ref = (
  key: string,
  label: string,
  reference: string,
  source: string,
  immutable = true,
): Field => ({ key, label, reference, source, immutable, required: true });
const status = (options: string[]): Field => ({
  key: "estado",
  label: "Estado",
  type: "select",
  options,
  required: true,
});
const roles: Field = {
  key: "roles",
  label: "Roles",
  type: "roles",
  required: true,
};
export const reason: Field = {
  key: "motivo",
  label: "Motivo del cambio",
  required: true,
  max: 500,
  hint: "Describe por qué se modifica el registro.",
};
const resourcesList: Resource[] = [
  {
    key: "idiomas",
    title: "Idiomas",
    singular: "idioma",
    path: "oferta/idiomas",
    description: "Idiomas que ofrece el centro.",
    fields: [code(15), name, active],
    columns: ["codigo", "nombre", "activo"],
    filters: [active],
  },
  {
    key: "niveles",
    title: "Niveles",
    singular: "nivel",
    path: "oferta/niveles",
    description: "Organiza la secuencia y los prerrequisitos de cada idioma.",
    fields: [
      ref("idiomaId", "Idioma", "idiomas", "idioma_id"),
      code(),
      { ...name, max: 100 },
      order,
      {
        ...ref(
          "prerrequisitoId",
          "Prerrequisito",
          "niveles",
          "prerrequisito_id",
          false,
        ),
        required: false,
        nullable: true,
      },
      {
        key: "duracionMeses",
        source: "duracion_meses",
        label: "Duración en meses",
        type: "number",
        min: 1,
        max: 32767,
        nullable: true,
      },
      active,
    ],
    columns: ["codigo", "nombre", "idiomaId", "orden", "activo"],
    filters: [ref("idiomaId", "Idioma", "idiomas", "idioma_id"), active],
  },
  {
    key: "unidades",
    title: "Unidades didácticas",
    singular: "unidad didáctica",
    path: "oferta/unidades",
    description: "Créditos y horas de las unidades de cada nivel.",
    fields: [
      ref("nivelId", "Nivel", "niveles", "nivel_id"),
      code(),
      { ...name, max: 120 },
      {
        key: "creditos",
        label: "Créditos",
        nullable: true,
        pattern: "(0|[1-9][0-9]{0,2})(\\.[0-9])?",
        hint: "Hasta un decimal, con punto. Ejemplo: 1.5.",
      },
      {
        key: "horasTeoricas",
        source: "horas_teoricas",
        label: "Horas teóricas",
        type: "number",
        required: true,
        min: 0,
        max: 32767,
      },
      {
        key: "horasPracticas",
        source: "horas_practicas",
        label: "Horas prácticas",
        type: "number",
        required: true,
        min: 0,
        max: 32767,
      },
      order,
      active,
    ],
    columns: ["codigo", "nombre", "nivelId", "creditos", "activo"],
    filters: [ref("nivelId", "Nivel", "niveles", "nivel_id"), active],
  },
  {
    key: "periodos",
    title: "Periodos académicos",
    singular: "periodo",
    path: "oferta/periodos",
    description: "Fechas de clases y matrícula, apertura y cierre del periodo.",
    fields: [
      code(),
      { ...name, max: 100 },
      ...(
        ["fechaInicio", "fechaFin", "matriculaInicio", "matriculaFin"] as const
      ).map((key, i) => ({
        key,
        label: [
          "Inicio de clases",
          "Fin de clases",
          "Inicio de matrícula",
          "Fin de matrícula",
        ][i],
        source: [
          "fecha_inicio",
          "fecha_fin",
          "matricula_inicio",
          "matricula_fin",
        ][i],
        type: "date" as const,
        required: true,
      })),
      status(["PLANIFICADO", "ABIERTO", "CERRADO"]),
    ],
    columns: ["codigo", "nombre", "fechaInicio", "fechaFin", "estado"],
    filters: [status(["PLANIFICADO", "ABIERTO", "CERRADO"])],
  },
  {
    key: "turnos",
    title: "Turnos",
    singular: "turno",
    path: "oferta/turnos",
    description: "Horarios disponibles para organizar los grupos.",
    fields: [
      { ...name, max: 50 },
      {
        key: "horaInicio",
        source: "hora_inicio",
        label: "Hora de inicio",
        type: "time",
        nullable: true,
      },
      {
        key: "horaFin",
        source: "hora_fin",
        label: "Hora de fin",
        type: "time",
        nullable: true,
      },
      active,
    ],
    columns: ["nombre", "horaInicio", "horaFin", "activo"],
    filters: [active],
  },
  {
    key: "secciones",
    title: "Secciones",
    singular: "sección",
    path: "oferta/secciones",
    description: "Identifica las secciones de la oferta académica.",
    fields: [code(15), { ...name, max: 60 }, active],
    columns: ["codigo", "nombre", "activo"],
    filters: [active],
  },
  {
    key: "grupos",
    title: "Grupos",
    singular: "grupo",
    path: "oferta/grupos",
    description: "Organiza la oferta y asigna sus docentes.",
    fields: [
      ref("periodoId", "Periodo", "periodos", "periodo_id"),
      ref("nivelId", "Nivel", "niveles", "nivel_id"),
      ref("turnoId", "Turno", "turnos", "turno_id"),
      ref("seccionId", "Sección", "secciones", "seccion_id"),
      code(30),
      {
        key: "capacidad",
        label: "Capacidad",
        type: "number",
        min: 1,
        max: 32767,
        nullable: true,
        hint: "Opcional. No se asigna un cupo por defecto.",
      },
      status(["PLANIFICADO", "ACTIVO", "CERRADO"]),
    ],
    columns: [
      "codigo",
      "periodoId",
      "nivelId",
      "turnoId",
      "seccionId",
      "estado",
    ],
    filters: [
      ref("periodoId", "Periodo", "periodos", "periodo_id"),
      ref("nivelId", "Nivel", "niveles", "nivel_id"),
      status(["PLANIFICADO", "ACTIVO", "CERRADO"]),
    ],
  },
  {
    key: "docentes",
    title: "Docentes",
    singular: "docente",
    path: "docentes",
    description: "Personas que enseñan en el centro y sus datos de contacto.",
    fields: [
      {
        key: "codigoDocente",
        source: "codigo_docente",
        label: "Código docente",
        required: true,
        max: 30,
      },
      {
        key: "personaId",
        source: "persona_id",
        label: "ID de persona existente",
        createOnly: true,
        pattern: "[1-9][0-9]{0,17}",
        hint: "Solo si la persona ya está registrada. De lo contrario, completa sus datos.",
      },
      {
        key: "persona.tipoDocumento",
        label: "Tipo de documento",
        required: true,
        max: 20,
        immutable: true,
      },
      {
        key: "persona.numeroDocumento",
        label: "Número de documento",
        required: true,
        max: 25,
        immutable: true,
      },
      { key: "persona.nombres", label: "Nombres", required: true, max: 100 },
      {
        key: "persona.apellidoPaterno",
        label: "Apellido paterno",
        required: true,
        max: 80,
      },
      {
        key: "persona.apellidoMaterno",
        label: "Apellido materno",
        nullable: true,
        max: 80,
      },
      {
        key: "persona.fechaNacimiento",
        label: "Fecha de nacimiento",
        type: "date",
        nullable: true,
      },
      { key: "persona.telefono", label: "Teléfono", nullable: true, max: 25 },
      {
        key: "persona.correo",
        label: "Correo",
        type: "email",
        nullable: true,
        max: 150,
      },
      {
        key: "persona.direccion",
        label: "Dirección",
        nullable: true,
        max: 250,
      },
      { key: "especialidad", label: "Especialidad", nullable: true, max: 120 },
      active,
    ],
    columns: [
      "codigoDocente",
      "nombres",
      "apellido_paterno",
      "especialidad",
      "activo",
    ],
    filters: [
      { key: "tipoDocumento", label: "Tipo de documento", max: 20 },
      { key: "numeroDocumento", label: "Número de documento", max: 25 },
      active,
    ],
  },
  {
    key: "usuarios",
    title: "Usuarios y roles",
    singular: "usuario",
    path: "usuarios",
    description: "Administra cuentas, permisos y su vinculación con personas.",
    fields: [
      {
        key: "nombreUsuario",
        source: "nombre_usuario",
        label: "Usuario",
        required: true,
        max: 60,
        min: 3,
        pattern: "[a-zA-Z0-9_.\\-]+",
      },
      {
        key: "passwordTemporal",
        label: "Contraseña temporal",
        type: "password",
        required: true,
        min: 12,
        max: 128,
        createOnly: true,
        hint: "El usuario deberá cambiarla al ingresar.",
      },
      {
        key: "personaId",
        source: "persona_id",
        label: "Persona docente",
        reference: "personas-docentes",
        nullable: true,
        hint: "Vincula al docente para que pueda acceder a sus grupos.",
      },
      { ...roles, createOnly: true },
      active,
    ],
    columns: ["nombreUsuario", "roles", "activo"],
    filters: [],
  },
];
export const resources: Record<string, Resource> = Object.fromEntries(
  resourcesList.map((resource) => [resource.key, resource]),
);
export function fieldValue(field: Field, row?: Row): string {
  const value = row ? text(row, field.source ?? field.key) : "";
  return field.type === "time"
    ? value.slice(0, 5)
    : field.type === "date"
      ? value.slice(0, 10)
      : value;
}
export function optionLabel(
  row: Row,
  resource: string,
  lookups: Record<string, Row[]>,
): string {
  if (resource === "docentes" || resource === "personas-docentes")
    return `${text(row, "codigo_docente")} · ${text(row, "nombres")} ${text(row, "apellido_paterno")}`;
  const base = [text(row, "codigo"), text(row, "nombre")]
    .filter(Boolean)
    .join(" · ");
  const language =
    resource === "niveles"
      ? lookups.idiomas?.find(
          (item) => String(item.id) === text(row, "idioma_id"),
        )
      : undefined;
  return `${language ? `${text(language, "nombre")} / ` : ""}${base}${row.activo === false ? " (inactivo)" : ""}`;
}
export const rolesResource: Resource = {
  key: "roles",
  title: "Roles",
  singular: "roles",
  path: "",
  description: "Los cambios de roles cierran las sesiones de la cuenta.",
  fields: [roles],
  columns: [],
};
