import { personFields } from "../persons/fields";
import { active, type Resource } from "../configuration/model";
export const studentResource: Resource = {
  key: "estudiantes",
  path: "estudiantes",
  title: "Estudiantes",
  singular: "estudiante",
  description:
    "Conserva la identidad de la persona. Usa el código asignado por el centro.",
  columns: [],
  fields: [
    {
      key: "codigoEstudiante",
      source: "codigo_estudiante",
      label: "Código de estudiante",
      required: true,
      max: 30,
      immutable: true,
    },
    {
      key: "fechaRegistro",
      source: "fecha_registro",
      label: "Fecha de registro",
      type: "date",
      required: true,
      immutable: true,
    },
    ...personFields,
    active,
  ],
};
