import type {
  AttendanceCode,
  AttendanceSummaryData,
  SessionGroup,
} from "../attendance/model";
import type { Grade, GradeSummaryData } from "./grades-model";
import type { GroupEvaluationView } from "./model";

export type StoredResult = {
  id: string;
  matricula_id: string;
  promedio: string | null;
  nota_oficial: number | null;
  tardanzas_total: number;
  faltas_equivalentes: string;
  inasistencia_pct: string | null;
  condicion: string | null;
  calculado_at: string;
  confirmado_at: string | null;
  cierre_id: string | null;
  configuracion_id: string | null;
  version: number;
  calculo: Record<string, unknown> | null;
};
export type ActRow = {
  matricula_id: string;
  codigo_matricula: string;
  estudiante: string;
  tipo_documento: string;
  numero_documento: string;
  numero_intento: number;
  estado_matricula: string;
  resumenAsistencia: AttendanceSummaryData;
  resumenNotas: GradeSummaryData;
  calculo: { condicion: string | null; listo: boolean; pendientes: string[] };
  resultado: StoredResult | null;
};
export type ActTotals = {
  matriculas: number;
  listos: number;
  aprobados: number;
  desaprobados: number;
  retirados: number;
  pendientes: number;
};
export type ActClosure = {
  id: string;
  grupo_id: string;
  tipo: "ACTA";
  estado: "CERRADO";
  realizado_por: string;
  realizado_nombre: string;
  realizado_at: string;
  motivo: string | null;
  revision: string;
  resumen: { resumen?: ActTotals; items?: ActRow[] };
};
export type ActEvent = {
  id: string;
  accion: string;
  usuario_id: string;
  nombre_usuario: string;
  ocurrido_at: string;
  motivo: string | null;
  entidad_id: string;
  valor_anterior: StoredResult | null;
  valor_nuevo: StoredResult | null;
};
export type ActView = Pick<
  GroupEvaluationView,
  "grupo" | "configuracion" | "plan"
> & {
  cierre: ActClosure | null;
  revision: string;
  puedeCerrar: boolean;
  puedeCorregir: boolean;
  pendientes: string[];
  resumen: ActTotals;
  items: ActRow[];
  nextCursor: string | null;
  historial: ActEvent[];
};
export type ActSession = {
  id: string;
  fecha: string;
  estado: string;
  computable: boolean;
  asistencia: {
    id: string;
    codigo: AttendanceCode;
    observacion: string | null;
    version: number;
  } | null;
  justificacionId: string | null;
  justificacionEstado: string | null;
};
export type ActDetail = {
  grupo: SessionGroup;
  cierre: ActClosure | null;
  revision: string;
  puedeCorregir: boolean;
  item: ActRow;
  calificaciones: (Grade & { evaluacion: string; indicador: string })[];
  sesiones: ActSession[];
  historial: ActEvent[];
};
