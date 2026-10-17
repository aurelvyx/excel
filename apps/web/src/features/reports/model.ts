import type { SessionGroup, AttendanceSummaryData } from "../attendance/model";
import type { GradeSummaryData } from "../evaluation/grades-model";
import type { StoredResult } from "../evaluation/acts-model";

export type ReportType = "MATRIZ_NOTAS" | "RESUMEN_PARTICIPANTES";
export const reportNames: Record<ReportType, string> = {
  MATRIZ_NOTAS: "Matriz de notas",
  RESUMEN_PARTICIPANTES: "Resumen de participantes",
};
export type ReportRow = {
  matriculaId: string;
  codigo: string;
  intento: number;
  estudiante: string;
  tipoDocumento: string;
  documento: string;
  notas: Record<string, string | null>;
  resumenNotas: GradeSummaryData;
  resumenAsistencia: AttendanceSummaryData;
  resultado: StoredResult | null;
};
export type ReportPreview = {
  grupo: SessionGroup;
  tipo: ReportType;
  plantilla: {
    id: string;
    tipo: ReportType;
    idioma: "EN" | "PT";
    version: number;
    estado: "PROPUESTA";
    sha256: string;
  };
  revision: string;
  puedeExportar: boolean;
  pendientes: string[];
  advertencias: string[];
  resumen: {
    matriculas: number;
    aprobados: number | null;
    desaprobados: number | null;
    retirados: number | null;
    resultadosPendientes: number;
  };
  indicadores: {
    id: string;
    evaluacion: string;
    codigo: string;
    descripcion: string;
    pesoEvaluacion: string;
    pesoIndicador: string;
  }[];
  items: ReportRow[];
  nextCursor: string | null;
  anexo: {
    idioma: string;
    nivel: string;
    creditos: string | null;
    horas: number | null;
    fechaInicio: string;
    fechaFin: string;
    matriculados: number;
    aprobados: number | null;
  };
};
export type ReportHistory = {
  items: {
    id: string;
    nombre_usuario: string;
    tipo: ReportType;
    archivo_nombre: string;
    plantilla_id: string;
    plantilla_version: number;
    filas: number;
    modo: "BORRADOR";
    generado_at: string;
  }[];
  nextCursor: string | null;
};
