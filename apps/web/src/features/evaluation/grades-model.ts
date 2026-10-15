import type { GroupEvaluationView } from "./model";

export type Grade = {
  id: string;
  matricula_id: string;
  indicador_id: string;
  grupo_id: string;
  nota: string;
  version: number;
  registrado_por: string;
  registrado_at: string;
  actualizado_at: string | null;
};
export type GradeSummaryData = {
  configuracionAprobada: boolean;
  promedio: string | null;
  notaOficial: number | null;
  calificacionesEsperadas: number;
  calificacionesRegistradas: number;
  calificacionesPendientes: number;
  motivoPendiente: string | null;
};
export type GradeRow = {
  matricula_id: string;
  codigo_matricula: string;
  estudiante: string;
  tipo_documento: string;
  numero_documento: string;
  numero_intento: number;
  estado_matricula: string;
  editable: boolean;
  calificaciones: Grade[];
  resumenNotas: GradeSummaryData;
};
export type GradesPageData = Pick<
  GroupEvaluationView,
  | "grupo"
  | "configuracion"
  | "plan"
  | "evaluaciones"
  | "unidades"
  | "preparacionActa"
> & {
  items: GradeRow[];
  nextCursor: string | null;
  acta: {
    cerrada: boolean;
    cierre: { realizado_nombre?: string; realizado_at?: string } | null;
  };
  puedeEditar: boolean;
  motivoSoloLectura: string | null;
};
export type SavedGrades = {
  items: Grade[];
  resumenes: { matriculaId: string; resumenNotas: GradeSummaryData }[];
  preparacionActa: GradesPageData["preparacionActa"];
};
export type GradeHistory = {
  calificacion: Grade | null;
  items: {
    id: string;
    accion: string;
    usuario_id: string;
    nombre_usuario: string;
    ocurrido_at: string;
    motivo: string | null;
    valor_anterior: { nota?: string; version?: number } | null;
    valor_nuevo: { nota?: string; version?: number } | null;
  }[];
};
