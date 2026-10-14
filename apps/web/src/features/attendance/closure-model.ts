import type {
  AttendanceClosureEvent,
  AttendanceSummaryData,
  SessionGroup,
} from "./model";

export type ClosureWarnings = {
  sesionesComputables: number;
  sesionesProgramadas: number;
  sesionesFuturas: number;
  sesionesCanceladas: number;
  matriculasRevisables: number;
  marcasPendientes: number;
  justificacionesPendientes: number;
};
export type ClosureRow = {
  matricula_id: string;
  codigo_matricula: string;
  numero_intento: number;
  estado_matricula: string;
  estudiante_id: string;
  estudiante: string;
  tipo_documento: string;
  numero_documento: string;
  resumenAsistencia: AttendanceSummaryData;
};
export type AttendanceClosureData = {
  grupo: SessionGroup;
  hoy: string;
  cierre: AttendanceClosureEvent | null;
  revision: string;
  puedeCerrar: boolean;
  motivoSoloLectura: string | null;
  advertencias: ClosureWarnings;
  items: ClosureRow[];
  historial: AttendanceClosureEvent[];
};

/** Solo determina si se requiere reconocer las advertencias recibidas del servidor. */
export function needsClosureAcknowledgement(value: ClosureWarnings) {
  return (
    value.sesionesProgramadas > 0 ||
    value.sesionesFuturas > 0 ||
    value.marcasPendientes > 0 ||
    value.justificacionesPendientes > 0 ||
    value.sesionesComputables === 0 ||
    value.matriculasRevisables === 0
  );
}
