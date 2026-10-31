const allowedAttendanceReturnPaths = new Set([
  "/configuracion/grupos",
  "/consulta/grupos",
  "/mis-grupos/grupos",
  "/docencia/asistencias",
  "/docencia/calificaciones",
  "/matriculas",
]);

/** Only allow known in-app destinations for the optional return context. */
export function safeAttendanceReturnTo(
  value: string | null,
  groupId: string,
): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\#\s]/.test(value))
    return null;
  const pathname = value.split("?", 1)[0];
  if (
    allowedAttendanceReturnPaths.has(pathname ?? "") ||
    pathname === `/asistencia/grupos/${groupId}` ||
    pathname === `/asistencia/grupos/${groupId}/justificaciones`
  )
    return value;
  return null;
}

export function withAttendanceReturn(path: string, returnTo: string | null) {
  if (!returnTo) return path;
  const queryIndex = path.indexOf("?");
  const pathname = queryIndex < 0 ? path : path.slice(0, queryIndex);
  const params = new URLSearchParams(queryIndex < 0 ? "" : path.slice(queryIndex + 1));
  params.set("retorno", returnTo);
  return `${pathname}?${params}`;
}
