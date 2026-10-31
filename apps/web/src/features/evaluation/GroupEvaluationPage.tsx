import { useState } from "react";
import { ArrowLeft, CheckCircle2, AlertCircle, RefreshCw, SlidersHorizontal, GraduationCap, FileCheck } from "lucide-react";
import { api, errorText } from "../../shared/api";
import { useApiQuery } from "../../shared/useApiQuery";
import { Facts } from "../../shared/ui/Facts";
import { Feedback, Loading } from "../../shared/ui/Feedback";
import { GroupContext } from "../attendance/GroupContext";
import { academicTime } from "../attendance/model";
import { EvaluationActionDialog } from "./EvaluationActionDialog";
import { DefinitionView } from "./EvaluationDefinition";
import { formulaLabel, type GroupEvaluationView } from "./model";
import "../academic/academic.css";

export function GroupEvaluationPage({ groupId }: { groupId: string }) {
  const endpoint = `evaluacion/grupos/${groupId}/configuracion`;
  const { data, loading, error, reload } =
    useApiQuery<GroupEvaluationView>(endpoint);
  if (!loading && !error && data)
    return (
      <GroupEvaluation key={endpoint} initial={data} endpoint={endpoint} />
    );
  return (
    <div className="academic-container">
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <a className="academic-btn-action btn-action-secondary" href={`#/salones/${groupId}?tab=calificaciones`}>
          <ArrowLeft size={14} /> Volver al Salón
        </a>
      </div>
      <div className="academic-card" style={{ padding: "2rem" }}>
        {loading ? (
          <Loading>Cargando configuración de evaluaciones…</Loading>
        ) : (
          <Feedback onRetry={reload}>{error}</Feedback>
        )}
      </div>
    </div>
  );
}

function GroupEvaluation({
  initial,
  endpoint,
}: {
  initial: GroupEvaluationView;
  endpoint: string;
}) {
  const [data, setData] = useState(initial);
  const [applying, apply] = useState(false);
  const [busy, pending] = useState(false);
  const [stale, block] = useState(false);
  const [error, fail] = useState("");
  const [success, notify] = useState("");

  async function refresh() {
    pending(true);
    fail("");
    try {
      setData(await api<GroupEvaluationView>(endpoint));
      block(false);
      apply(false);
    } catch (e) {
      fail(errorText(e));
      block(true);
    } finally {
      pending(false);
    }
  }

  const readiness = data.preparacionActa;

  return (
    <div className="academic-container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <a className="academic-btn-action btn-action-secondary" href={`#/evaluacion/grupos/${data.grupo.id}/calificaciones`}>
            <ArrowLeft size={14} /> Planilla de Calificaciones
          </a>
          <a className="academic-btn-action btn-action-secondary" href={`#/salones/${data.grupo.id}`}>
            Salón 360°
          </a>
          <a className="academic-btn-action btn-action-secondary" href={`#/evaluacion/grupos/${data.grupo.id}/acta`}>
            <FileCheck size={14} /> Resultados y Acta
          </a>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <button
            type="button"
            disabled={busy || applying}
            onClick={() => void refresh()}
            className="academic-btn-action btn-action-secondary"
          >
            <RefreshCw size={14} className={busy ? "spin" : ""} /> Recargar
          </button>

          {data.puedeAplicar && (
            <button
              type="button"
              disabled={busy || stale || data.planesDisponibles.length === 0 || applying}
              onClick={() => apply(true)}
              className="academic-btn-action btn-action-primary"
            >
              <SlidersHorizontal size={14} /> Aplicar Versión Aprobada
            </button>
          )}
        </div>
      </div>

      <div className="academic-card" style={{ padding: "1.5rem", borderLeft: "4px solid #007a3d" }}>
        <span className="academic-badge badge-green" style={{ marginBottom: "0.4rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
          <GraduationCap size={13} /> Configuración de Evaluación del Salón
        </span>
        <h1 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#1e293b", margin: 0 }}>
          Criterios e Indicadores Aplicados · Salón {data.grupo.codigo}
        </h1>
        <p style={{ fontSize: "0.8125rem", color: "#64748b", margin: "0.35rem 0 0" }}>
          Define y consulta la estructura de unidades didácticas, evaluaciones y pesos porcentuales con los que se calculan las notas de este grupo.
        </p>
      </div>

      <GroupContext group={data.grupo} />

      {success && (
        <div style={{ padding: "0.75rem 1rem", backgroundColor: "#dcfce7", color: "#15803d", borderRadius: "0.5rem", border: "1px solid #bbf7d0", fontSize: "0.8125rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <CheckCircle2 size={16} />
          <span>{success}</span>
        </div>
      )}
      {error && (
        <div style={{ padding: "0.75rem 1rem", backgroundColor: "#fee2e2", color: "#991b1b", borderRadius: "0.5rem", border: "1px solid #fecaca", fontSize: "0.8125rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {!data.puedeAplicar && (
        <div style={{ padding: "0.75rem 1rem", backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "0.5rem", fontSize: "0.8125rem", color: "#475569" }}>
          <strong>Solo lectura:</strong>{" "}
          {data.motivoSoloLectura ??
            "La configuración del grupo se conserva sin modificaciones."}
        </div>
      )}

      <section className="academic-card" style={{ padding: "1.5rem" }}>
        {data.configuracion && data.plan ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1rem" }}>
              <h2 style={{ margin: 0, fontSize: "1.1rem", color: "#1e293b" }}>Criterios aplicados al grupo</h2>
              <a
                href={`#/evaluacion/planes/${data.plan.id}`}
                className="academic-btn-action btn-action-secondary"
              >
                Consultar versión matriz ({data.plan.version})
              </a>
            </div>
            <Facts
              items={[
                ["Versión", `${data.plan.version} · ${data.plan.nombre}`],
                ["Aplicada por", data.configuracion.aplicado_nombre],
                [
                  "Fecha de aplicación",
                  academicTime(data.configuracion.aplicado_at),
                ],
                ["Referencia de aprobación", data.plan.referencia_aprobacion],
                ["Fórmula", formulaLabel],
              ]}
            />
            <div style={{ marginTop: "1rem" }}>
              <DefinitionView
                units={data.unidades}
                value={{
                  evaluaciones: data.evaluaciones.map((entry) => ({
                    nombre: entry.nombre,
                    unidadId: entry.unidad_id,
                    pesoPct: entry.peso_pct,
                    orden: entry.orden,
                    indicadores: entry.indicadores.map((item) => ({
                      codigo: item.codigo,
                      descripcion: item.descripcion,
                      pesoPct: item.peso_pct,
                      orden: item.orden,
                    })),
                  })),
                }}
              />
            </div>
          </>
        ) : (
          <>
            <h2 style={{ marginTop: 0, fontSize: "1.1rem", color: "#1e293b" }}>Sin criterios aplicados</h2>
            <p style={{ color: "#64748b", fontSize: "0.875rem" }}>
              Selecciona una versión aprobada del nivel para conservarla en este grupo y habilitar la planilla de notas.
            </p>
            {data.planesDisponibles.length === 0 && (
              <p className="notice">
                No hay versiones aprobadas disponibles para este nivel.
              </p>
            )}
            <a
              href={`#/evaluacion/niveles/${data.nivel.id}`}
              className="academic-btn-action btn-action-secondary"
              style={{ width: "fit-content" }}
            >
              Consultar versiones del nivel
            </a>
          </>
        )}
      </section>

      {stale ? (
        <p className="notice">
          La configuración cambió o no pudo consultarse. Recarga explícitamente
          antes de continuar.
        </p>
      ) : (
        <section
          className="academic-card"
          style={{ padding: "1.5rem" }}
          aria-label="Preparación del acta"
        >
          <h2 style={{ marginTop: 0, fontSize: "1.1rem", color: "#1e293b" }}>Estado de Preparación para Cierre de Acta</h2>
          <Facts
            items={[
              [
                "Criterios aprobados",
                readiness.criteriosAprobados ? "Sí" : "No",
              ],
              ["Matrículas revisables", readiness.matriculasRevisables],
              ["Indicadores", readiness.indicadores],
              ["Calificaciones esperadas", readiness.calificacionesEsperadas],
              [
                "Calificaciones registradas",
                readiness.calificacionesRegistradas,
              ],
              ["Calificaciones pendientes", readiness.calificacionesPendientes],
            ]}
          />
          {readiness.motivos.length > 0 && (
            <ul style={{ color: "#b45309", fontSize: "0.8125rem", marginTop: "0.75rem" }}>
              {readiness.motivos.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {applying && (
        <EvaluationActionDialog<GroupEvaluationView>
          kind="apply"
          endpoint={endpoint}
          choices={data.planesDisponibles}
          units={data.unidades}
          onClose={() => apply(false)}
          onSaved={(next) => {
            setData(next);
            block(false);
            apply(false);
            fail("");
            notify(
              "Criterios aplicados. El grupo conserva esta versión aprobada.",
            );
          }}
          onConflict={() => block(true)}
          onReload={() => void refresh()}
        />
      )}
    </div>
  );
}
