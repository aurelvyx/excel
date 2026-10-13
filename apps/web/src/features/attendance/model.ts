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
export type AttendanceCode = "P" | "F" | "T" | "J";
export type AttendanceRecord = {
  id: string;
  matricula_id: string;
  codigo: AttendanceCode;
  observacion: string | null;
  version: number;
  registrado_por: string;
  registrado_at: string;
  actualizado_at: string | null;
};
export type AttendanceSummaryData = {
  estado:
    "NO_APLICA" | "SIN_SESIONES" | "INCOMPLETO" | "PROVISIONAL" | "CALCULADO";
  sesionesComputables: number;
  presentes: number;
  faltas: number;
  tardanzas: number;
  justificadas: number;
  marcasPendientes: number;
  faltasPorTardanzas: number;
  tardanzasRestantes: number;
  justificadasPendientes: number;
  justificadasRecuperadas: number;
  justificadasComputables: number;
  faltasConfirmadas: number;
  faltasComputables: number;
  inasistenciaPct: string | null;
  excedeLimite: boolean | null;
  condicion: "DENTRO_LIMITE" | "RETIRADO_INASISTENCIA" | null;
  reglas: {
    parametroId: string;
    version: number;
    inasistenciaMaxPct: string;
    tardanzasPorFalta: number;
  };
  cierreConfirmado: boolean;
  criterioSesiones: "REALIZADAS_DEL_GRUPO_HASTA_HOY";
};
export type AttendanceRow = {
  matricula_id: string;
  codigo_matricula: string;
  estudiante_id: string;
  estudiante: string;
  tipo_documento: string;
  numero_documento: string;
  numero_intento: number;
  estado_matricula: string;
  editable: boolean;
  asistencia: Omit<AttendanceRecord, "matricula_id"> | null;
  resumenAsistencia: AttendanceSummaryData;
};
export type AttendancePageData = {
  items: AttendanceRow[];
  nextCursor: string | null;
  grupo: SessionGroup;
  sesion: ClassSession;
  puedeEditar: boolean;
  motivoSoloLectura: string | null;
};
export const attendanceCodes: Record<AttendanceCode, string> = {
  P: "Presente",
  F: "Falta",
  T: "Tardanza",
  J: "Falta justificada",
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
