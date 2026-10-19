import {
  academicTime,
  type AttendanceSummaryData,
  type SessionGroup,
} from "./model";

export type JustificationState =
  "PENDIENTE" | "APROBADA" | "RECHAZADA" | "RECUPERADA" | "NO_RECUPERADA";
export type Justification = {
  id: string;
  asistencia_id: string;
  motivo: string;
  fecha_presentacion: string;
  estado: JustificationState;
  version: number;
  registrado_por: string;
  registrado_at: string;
  registrado_nombre: string;
  resuelto_por: string | null;
  resuelto_at: string | null;
  resuelto_nombre: string | null;
  observacion_resolucion: string | null;
  recuperacion_confirmada_por: string | null;
  recuperacion_at: string | null;
  recuperacion_nombre: string | null;
  observacion_recuperacion: string | null;
};
export type JustificationRow = {
  asistencia_id: string;
  sesion_id: string;
  fecha_sesion: string;
  estado_sesion: "PROGRAMADA" | "REALIZADA" | "CANCELADA";
  matricula_id: string;
  codigo_matricula: string;
  numero_intento: number;
  estado_matricula: string;
  estudiante_id: string;
  estudiante: string;
  tipo_documento: string;
  numero_documento: string;
  codigo: "J";
  asistencia_version: number;
  justificacion: Justification | null;
  puedeRegistrar: boolean;
  puedeResolver: boolean;
  puedeConfirmarRecuperacion: boolean;
  motivoSoloLectura: string | null;
  resumenAsistencia: AttendanceSummaryData;
};
export type JustificationEvent = {
  id: string;
  accion: string;
  usuario_id: string;
  nombre_usuario: string;
  ocurrido_at: string;
  motivo: string | null;
  estado_anterior: JustificationState | null;
  estado_nuevo: JustificationState;
};
export type JustificationDetail = JustificationRow & {
  historial?: JustificationEvent[];
};
export type JustificationsPageData = {
  items: JustificationRow[];
  nextCursor: string | null;
  grupo: SessionGroup;
  hoy: string;
};
export type JustificationAction = "REGISTER" | "RESOLVE" | "RECOVER" | "DETAIL";
export const justificationStates: Record<
  JustificationState | "SIN_SOLICITUD",
  string
> = {
  SIN_SOLICITUD: "Sin solicitud",
  PENDIENTE: "Pendiente",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
  RECUPERADA: "Recuperada",
  NO_RECUPERADA: "No recuperada",
};
export const justificationActions: Record<JustificationAction, string> = {
  REGISTER: "Registrar justificación",
  RESOLVE: "Resolver justificación",
  RECOVER: "Confirmar recuperación",
  DETAIL: "Detalle de justificación",
};
export const justificationEventLabels: Record<string, string> = {
  CREATE: "Solicitud registrada",
  APPROVE: "Justificación aprobada",
  REJECT: "Justificación rechazada",
  RECOVER: "Recuperada",
  NOT_RECOVERED: "No recuperada",
};

export const justificationTime = academicTime;
