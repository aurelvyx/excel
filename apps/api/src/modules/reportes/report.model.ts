import type { AcademicGroup } from '../asistencia/academic-context.js';
import type { AttendanceSummary } from '../asistencia/attendance-calculation.policy.js';
import type { GradeSummary } from '../evaluacion/grade-calculation.service.js';
import type { StoredResult } from '../evaluacion/act.repository.js';

export const reportTypes = ['MATRIZ_NOTAS', 'RESUMEN_PARTICIPANTES'] as const;
export type ReportType = (typeof reportTypes)[number];
export type ReportLanguage = 'EN' | 'PT';
export type ReportTemplateInfo = {
  id: string;
  tipo: ReportType;
  idioma: ReportLanguage;
  version: number;
  estado: 'PROPUESTA';
  sha256: string;
};
export type ReportIndicator = {
  id: string;
  evaluacion: string;
  codigo: string;
  descripcion: string;
  pesoEvaluacion: string;
  pesoIndicador: string;
};
export type ReportRow = {
  matriculaId: string;
  codigo: string;
  intento: number;
  estudiante: string;
  tipoDocumento: string;
  documento: string;
  notas: Record<string, string | null>;
  resumenNotas: GradeSummary;
  resumenAsistencia: AttendanceSummary;
  resultado: StoredResult | null;
};
export type ReportAnnex = {
  idioma: string;
  nivel: string;
  creditos: string | null;
  horas: number | null;
  fechaInicio: string;
  fechaFin: string;
  matriculados: number;
  aprobados: number | null;
};
export type ReportTotals = {
  matriculas: number;
  aprobados: number | null;
  desaprobados: number | null;
  retirados: number | null;
  resultadosPendientes: number;
};
/** Instantánea completa; la paginación pertenece solo a la vista previa. */
export type ReportSnapshot = {
  grupo: AcademicGroup;
  tipo: ReportType;
  plantilla: ReportTemplateInfo;
  revision: string;
  puedeExportar: boolean;
  pendientes: string[];
  advertencias: string[];
  resumen: ReportTotals;
  indicadores: ReportIndicator[];
  items: ReportRow[];
  anexo: ReportAnnex;
};
export type ReportPage = ReportSnapshot & { nextCursor: string | null };
