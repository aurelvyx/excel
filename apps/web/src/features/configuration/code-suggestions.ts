import { text, type Row } from "../../shared/api";

const part = (value: string, length: number) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, length);

/** Propuestas editables. La API sigue comprobando los códigos y su unicidad. */
export function suggestCatalogCode(
  key: string,
  values: Record<string, string | string[]>,
  lookups: Record<string, Row[]>,
) {
  const option = (catalog: string, field: string) =>
    (lookups[catalog] ?? []).find((row) => String(row.id) === values[field]) ??
    {};
  if (key === "unidades")
    return `UD-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  if (key === "secciones")
    return `SEC-${part(String(values.nombre ?? ""), 11)}`;
  if (key === "periodos") {
    const date = String(values.fechaInicio ?? "");
    return date ? `PER-${date.replaceAll("-", "")}` : "";
  }
  if (key === "niveles") {
    const language = part(text(option("idiomas", "idiomaId"), "codigo"), 5);
    const name = part(String(values.nombre ?? ""), 8);
    return language && name
      ? `${language}-${name}-${String(values.orden ?? "").padStart(2, "0")}`.slice(
          0,
          20,
        )
      : "";
  }
  if (key === "grupos") {
    const codes = [
      part(text(option("periodos", "periodoId"), "codigo"), 6),
      part(text(option("niveles", "nivelId"), "codigo"), 6),
      part(text(option("turnos", "turnoId"), "nombre"), 4),
      part(text(option("secciones", "seccionId"), "codigo"), 4),
    ];
    return codes.every(Boolean) ? `GR-${codes.join("-")}` : "";
  }
  return "";
}
