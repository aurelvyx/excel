import type { Field } from "../../shared/form-types";
export const personFields: Field[] = [
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
];
