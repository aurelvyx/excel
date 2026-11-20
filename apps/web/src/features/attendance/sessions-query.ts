import { api } from "../../shared/api";
import type { SessionsPageData } from "./model";

/** Consulta completa para calendario y selector, respetando los cursores del servidor. */
export async function loadAllSessions(
  endpoint: string,
  signal: AbortSignal,
): Promise<SessionsPageData> {
  const first = await api<SessionsPageData>(`${endpoint}?limit=100`, {
    signal,
  });
  const items = [...first.items];
  let after = first.nextCursor;
  while (after) {
    const search = new URLSearchParams({ limit: "100", after });
    const next = await api<SessionsPageData>(`${endpoint}?${search}`, {
      signal,
    });
    items.push(...next.items);
    after = next.nextCursor;
  }
  return {
    ...first,
    items: items.sort((a, b) => a.fecha.localeCompare(b.fecha)),
    nextCursor: null,
  };
}
