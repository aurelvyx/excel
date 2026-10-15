/** Validación de captura únicamente; el servidor calcula la calificación oficial. */
export function captureGradeError(raw: string): string | undefined {
  const value = raw.trim().replace(",", ".");
  if (!value)
    return "Ingresa una nota; una nota registrada no puede quedar vacía.";
  return !/^(?:0|[1-9]\d?)(?:\.\d{1,2})?$/.test(value) || Number(value) > 20
    ? "Ingresa una nota de 0 a 20, con coma o punto y hasta dos decimales."
    : undefined;
}

export function gradeCaptureValue(raw: string): string {
  const [whole, fraction = ""] = raw.trim().replace(",", ".").split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
}

export function displayedGrade(value: string | null): string {
  return value === null ? "Pendiente" : value.replace(".", ",");
}
