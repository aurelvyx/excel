import type { SessionGroup } from "../attendance/model";

export type EvaluationLevel = { id: string; nombre: string; idioma: string };
export type EvaluationUnit = {
  id: string;
  nombre: string;
  orden: number;
  activo: boolean;
};
export type EvaluationIndicator = {
  codigo: string;
  descripcion: string;
  pesoPct: string;
  orden: number;
};
export type EvaluationComponent = {
  nombre: string;
  unidadId: string | null;
  pesoPct: string;
  orden: number;
  indicadores: EvaluationIndicator[];
};
export type EvaluationDefinition = { evaluaciones: EvaluationComponent[] };
export type EvaluationPlan = {
  id: string;
  nivel_id: string;
  version: number;
  nombre: string;
  formula: string;
  estructura: EvaluationDefinition;
  estado: "BORRADOR" | "APROBADO";
  revision: number;
  creado_por: string;
  creado_nombre: string;
  creado_at: string;
  aprobado_por: string | null;
  aprobado_nombre: string | null;
  aprobado_at: string | null;
  referencia_aprobacion: string | null;
};
export type PlanList = {
  nivel: EvaluationLevel;
  items: EvaluationPlan[];
  unidades: EvaluationUnit[];
  puedeCrear: boolean;
  formulaSoportada: string;
};
export type PlanView = {
  plan: EvaluationPlan;
  nivel: EvaluationLevel;
  unidades: EvaluationUnit[];
  puedeEditar: boolean;
  puedeAprobar: boolean;
  motivoSoloLectura: string | null;
  validacion: {
    completa: boolean;
    pesoTotalPct: string;
    evaluaciones: number;
    indicadores: number;
    errores: string[];
  };
  historial: {
    id: string;
    accion: string;
    usuario_id: string;
    nombre_usuario: string;
    ocurrido_at: string;
    motivo: string | null;
  }[];
};
export type GroupEvaluationView = {
  grupo: SessionGroup;
  nivel: EvaluationLevel;
  unidades: EvaluationUnit[];
  configuracion: null | {
    id: string;
    grupo_id: string;
    nivel_id: string;
    plan_id: string;
    aplicado_por: string;
    aplicado_nombre: string;
    aplicado_at: string;
  };
  plan: EvaluationPlan | null;
  planesDisponibles: EvaluationPlan[];
  evaluaciones: {
    id: string;
    nombre: string;
    peso_pct: string;
    orden: number;
    unidad_id: string | null;
    indicadores: {
      id: string;
      codigo: string;
      descripcion: string;
      peso_pct: string;
      orden: number;
    }[];
  }[];
  puedeAplicar: boolean;
  motivoSoloLectura: string | null;
  preparacionActa: {
    criteriosAprobados: boolean;
    matriculasRevisables: number;
    indicadores: number;
    calificacionesEsperadas: number;
    calificacionesRegistradas: number;
    calificacionesPendientes: number;
    puedeCerrar: boolean;
    motivos: string[];
  };
};
export const evaluationFormula = "PONDERADA_JERARQUICA_V1";
export const formulaLabel =
  "Ponderación de indicadores dentro de cada evaluación y de evaluaciones dentro del nivel";

/** Ayudas de captura; las sumas y la aprobación siempre las valida la API. */
export function captureWeightError(weight: string): string | undefined {
  return !/^(?:0|[1-9]\d{0,2})(?:\.\d{1,2})?$/.test(weight) ||
    Number(weight) <= 0 ||
    Number(weight) > 100
    ? "Ingresa un peso mayor que 0 y como máximo 100, con punto y hasta dos decimales."
    : undefined;
}
export function captureOrderError(order: number): string | undefined {
  return !Number.isInteger(order) || order < 1 || order > 32767
    ? "Ingresa un orden entero de 1 a 32767."
    : undefined;
}
export function validatePlanCapture(
  name: string,
  formula: string,
  definition: EvaluationDefinition,
): string {
  if (!name.trim()) return "Indica el nombre de la versión.";
  if (!formula) return "Selecciona la fórmula de evaluación.";
  for (const entry of definition.evaluaciones) {
    if (!entry.nombre.trim() || captureOrderError(entry.orden))
      return "Completa el nombre y el orden válido de cada evaluación.";
    for (const item of [entry, ...entry.indicadores]) {
      const issue = captureWeightError(item.pesoPct);
      if (issue) return issue;
    }
    if (
      entry.indicadores.some(
        (item) =>
          !item.codigo.trim() ||
          !item.descripcion.trim() ||
          captureOrderError(item.orden),
      )
    )
      return "Completa código, descripción y orden válido de cada indicador.";
  }
  return "";
}
