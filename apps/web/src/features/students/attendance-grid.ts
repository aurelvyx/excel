export type SessionMark = {
  /** Fecha civil AAAA-MM-DD, sin conversión de zona horaria. */
  fecha: string;
  /** P, F, T, J o null cuando la sesión no tiene marca. */
  codigo: string | null;
  /** Estado de la sesión: PROGRAMADA, REALIZADA o CANCELADA. */
  estado: string;
};

export type WeekCell = SessionMark | null;

export type WeekRow = {
  /** Lunes de la semana, AAAA-MM-DD. */
  lunes: string;
  numero: number;
  /** Indexada de 0 (lunes) a 6 (domingo). */
  dias: WeekCell[];
  totales: { P: number; F: number; T: number; J: number; sinMarca: number };
};

export type WeekGrid = {
  semanas: WeekRow[];
  /** Índices de día (0=lunes) que tienen al menos una sesión. */
  diasVisibles: number[];
  totales: WeekRow["totales"];
  desde: string | null;
  hasta: string | null;
};

const DAY_MS = 86_400_000;
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const parse = (date: string) => {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!);
};
/** 0=lunes … 6=domingo. */
const weekday = (ms: number) => (new Date(ms).getUTCDay() + 6) % 7;

export const dayNames = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/**
 * Agrupa las sesiones de un intento por semana calendario, desde la primera
 * hasta la última. Solo reorganiza marcas ya registradas: no calcula faltas,
 * porcentajes ni condiciones (eso lo determina la API).
 */
export function buildWeekGrid(marks: SessionMark[]): WeekGrid {
  const empty = () => ({ P: 0, F: 0, T: 0, J: 0, sinMarca: 0 });
  if (!marks.length)
    return {
      semanas: [],
      diasVisibles: [],
      totales: empty(),
      desde: null,
      hasta: null,
    };
  const sorted = [...marks].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const first = parse(sorted[0]!.fecha);
  const last = parse(sorted[sorted.length - 1]!.fecha);
  const start = first - weekday(first) * DAY_MS;
  const count = Math.floor((last - start) / (7 * DAY_MS)) + 1;
  const semanas: WeekRow[] = Array.from({ length: count }, (_, i) => ({
    lunes: ymd(start + i * 7 * DAY_MS),
    numero: i + 1,
    dias: Array<WeekCell>(7).fill(null),
    totales: empty(),
  }));
  const total = empty();
  const visible = new Set<number>();
  for (const mark of sorted) {
    const at = parse(mark.fecha);
    const week = semanas[Math.floor((at - start) / (7 * DAY_MS))]!;
    const day = weekday(at);
    week.dias[day] = mark;
    visible.add(day);
    if (mark.estado === "CANCELADA") continue;
    const key =
      mark.codigo === "P" ||
      mark.codigo === "F" ||
      mark.codigo === "T" ||
      mark.codigo === "J"
        ? mark.codigo
        : "sinMarca";
    week.totales[key]++;
    total[key]++;
  }
  return {
    semanas,
    diasVisibles: [...visible].sort((a, b) => a - b),
    totales: total,
    desde: sorted[0]!.fecha.slice(0, 10),
    hasta: sorted[sorted.length - 1]!.fecha.slice(0, 10),
  };
}
