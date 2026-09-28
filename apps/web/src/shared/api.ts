export type Role = "ADMIN" | "SECRETARIA" | "DOCENTE" | "COORDINADOR";
export type Session = {
  user: {
    id: string;
    nombre_usuario: string;
    roles: Role[];
    requiere_cambio_clave: boolean;
  };
  csrfToken: string;
};
export type Row = Record<string, unknown> & { id: string | number };
export type Page = { items: Row[]; nextCursor: string | null };
let csrf = "";
export function setSession(session: Session | null) {
  csrf = session?.csrfToken ?? "";
}
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  let response: Response;
  const requestCsrf = csrf;
  try {
    response = await fetch(`/api/v1/${path}`, {
      method: options.method ?? "GET",
      credentials: "same-origin",
      cache: "no-store",
      signal: options.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "Excel-Web",
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      },
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError(
      0,
      "No se pudo conectar. Comprueba la conexión y vuelve a intentarlo.",
    );
  }
  if (!response.ok) {
    if (
      response.status === 401 &&
      path !== "auth/login" &&
      requestCsrf === csrf
    )
      window.dispatchEvent(new Event("session-expired"));
    const body = await response.json().catch(() => ({}));
    const messages: Record<number, string> = {
      400: "Revisa los campos, fechas y referencias del formulario.",
      401:
        path === "auth/login"
          ? "Usuario o contraseña incorrectos."
          : "La sesión terminó. Vuelve a ingresar.",
      403: "No tienes permiso para esta acción. Actualiza la página para comprobar tu acceso.",
      404: "El registro ya no está disponible.",
      409: "No se pudo guardar por un conflicto. Revisa los duplicados y el estado de los registros.",
      429: "Demasiados intentos. Espera un minuto antes de volver a intentarlo.",
    };
    const message =
      (response.status === 400 || response.status === 409) &&
      typeof body.message === "string"
        ? body.message
        : messages[response.status];
    throw new ApiError(
      response.status,
      message ??
        "El servicio no pudo completar la operación. Inténtalo de nuevo.",
    );
  }
  return response.status === 204
    ? (undefined as T)
    : (response.json() as Promise<T>);
}
export async function allRows(
  path: string,
  signal?: AbortSignal,
): Promise<Row[]> {
  const rows: Row[] = [];
  let after: string | null = "0";
  do {
    const page: Page = await api<Page>(`${path}?limit=100&after=${after}`, {
      signal,
    });
    rows.push(...page.items);
    after = page.nextCursor;
  } while (after !== null);
  return rows;
}
export const text = (row: Record<string, unknown>, key: string): string => {
  const value = key
    .split(".")
    .reduce<unknown>(
      (value, part) =>
        value && typeof value === "object"
          ? (value as Record<string, unknown>)[part]
          : undefined,
      row,
    );
  return value === undefined || value === null ? "" : String(value);
};
export const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "No se pudo completar la operación.";
