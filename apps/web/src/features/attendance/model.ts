export type ClassSession = {
  id: string;
  grupo_id: string;
  fecha: string;
  hora_inicio: string | null;
  hora_fin: string | null;
  estado: "PROGRAMADA" | "REALIZADA" | "CANCELADA";
  creado_por: string;
};
export type SessionGroup = {
  id: string;
  codigo: string;
  estado: string;
  periodo_id: string;
  fecha_inicio: string;
  fecha_fin: string;
  periodo_estado: string;
  asistencia_cerrada: boolean;
  contexto: {
    periodo: string;
    idioma: string;
    nivel: string;
    turno: string;
    seccion: string;
  };
};
export type SessionsPageData = {
  items: ClassSession[];
  nextCursor: string | null;
  grupo: SessionGroup;
  puedeProgramar: boolean;
};
export const sessionStates: Record<ClassSession["estado"], string> = {
  PROGRAMADA: "Programada",
  REALIZADA: "Realizada",
  CANCELADA: "Cancelada",
};

/** Las fechas académicas son fechas civiles, sin conversión a UTC ni hora local. */
export function sessionDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export function sessionTime(start: string | null, end: string | null) {
  return start && end
    ? `${start.slice(0, 5)} – ${end.slice(0, 5)}`
    : "Sin horario";
}
