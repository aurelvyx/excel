import { text, type Row } from "../../shared/api";
/** Detalle y alta usan el contrato de persona; la búsqueda proyecta campos planos. */
export function studentRow(row: Row): Row {
  if (!row.persona) return row;
  return {
    ...row,
    nombres: text(row, "persona.nombres"),
    apellido_paterno: text(row, "persona.apellidoPaterno"),
    apellido_materno: text(row, "persona.apellidoMaterno"),
    tipo_documento: text(row, "persona.tipoDocumento"),
    numero_documento: text(row, "persona.numeroDocumento"),
  };
}
export function studentName(row: Row): string {
  const flat = studentRow(row);
  return [
    text(flat, "nombres"),
    text(flat, "apellido_paterno"),
    text(flat, "apellido_materno"),
  ]
    .filter(Boolean)
    .join(" ");
}
