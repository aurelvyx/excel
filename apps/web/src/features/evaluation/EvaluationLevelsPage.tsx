import { useState, useRef, useEffect, type FormEvent } from "react";
import { ArrowLeft, Plus, ExternalLink } from "lucide-react";
import { ApiError, api, errorText } from "../../shared/api";
import { FormDialog } from "../../shared/FormDialog";
import { navigate } from "../../shared/navigation";
import { useApiQuery } from "../../shared/useApiQuery";
import { Feedback } from "../../shared/ui/Feedback";
import { Facts } from "../../shared/ui/Facts";
import { DefinitionView } from "./EvaluationDefinition";
import { PlanFields } from "./PlanFields";
import {
  formulaLabel,
  validatePlanCapture,
  type EvaluationDefinition,
  type PlanList,
  type PlanView,
} from "./model";
import "../academic/academic.css";

export function EvaluationLevelsPage({ levelId }: { levelId?: string }) {
  useEffect(() => {
    if (!levelId) {
      navigate("/matriz-curricular");
    }
  }, [levelId]);

  return levelId ? <LevelPlans key={levelId} levelId={levelId} /> : null;
}

function LevelPlans({ levelId }: { levelId: string }) {
  const { data, loading, error, reload } = useApiQuery<PlanList>(
    `evaluacion/niveles/${levelId}/planes`,
  );
  const [creating, create] = useState(false);
  const [stale, block] = useState(false);
  const [createdPlanId, setCreatedPlanId] = useState<string | null>(null);

  useEffect(() => {
    if (!creating && createdPlanId) {
      navigate(`/evaluacion/planes/${createdPlanId}`);
    }
  }, [creating, createdPlanId]);

  return (
    <div className="academic-container">
      {/* Back button */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
        <a
          href="#/matriz-curricular"
          className="academic-btn-action btn-action-secondary"
          style={{ padding: "0.4rem 0.8rem" }}
        >
          <ArrowLeft size={14} /> Volver a Matriz Curricular
        </a>
      </div>

      {/* Header Banner */}
      <div className="academic-card" style={{ padding: "1.5rem", marginBottom: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
              <span className="academic-badge badge-green">
                {data ? `${data.nivel.idioma} — ${data.nivel.nombre}` : "Nivel Académico"}
              </span>
            </div>
            <h1 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#1e293b", margin: 0 }}>
              Versiones de Criterios y Fórmulas
            </h1>
            <p style={{ fontSize: "0.8125rem", color: "#64748b", margin: "0.3rem 0 0 0" }}>
              Historial de versiones y ponderaciones curriculares. Los salones de clase conservan la versión aprobada que se les aplicó.
            </p>
          </div>

          {data?.puedeCrear && (
            <button
              type="button"
              className="academic-btn-action btn-action-primary"
              disabled={loading || !!error || stale}
              onClick={() => create(true)}
              style={{ padding: "0.5rem 1rem" }}
            >
              <Plus size={14} /> Nueva Versión
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: "3rem", textAlign: "center", color: "#64748b" }}>
          Cargando versiones de criterios…
        </div>
      ) : error ? (
        <Feedback onRetry={reload}>{error}</Feedback>
      ) : (
        data && (
          <>
            <div className="academic-card" style={{ padding: 0, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
                <thead>
                  <tr style={{ backgroundColor: "#f8fafc", borderBottom: "2px solid #e2e8f0", color: "#475569", textAlign: "left" }}>
                    <th style={{ padding: "0.75rem 1rem", width: "100px" }}>Versión</th>
                    <th style={{ padding: "0.75rem 1rem" }}>Nombre del Plan / Criterio</th>
                    <th style={{ padding: "0.75rem 1rem", width: "140px", textAlign: "center" }}>Estado</th>
                    <th style={{ padding: "0.75rem 1rem", width: "180px", textAlign: "right" }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ padding: "2rem", textAlign: "center", color: "#64748b" }}>
                        Todavía no hay versiones de criterios registradas para este nivel.
                      </td>
                    </tr>
                  ) : (
                    data.items.map((row) => {
                      const isAprobado = row.estado === "APROBADO";
                      return (
                        <tr key={row.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "0.75rem 1rem" }}>
                            <span className="academic-badge badge-green">Versión {row.version}</span>
                          </td>
                          <td style={{ padding: "0.75rem 1rem", fontWeight: 600, color: "#1e293b" }}>
                            {row.nombre}
                          </td>
                          <td style={{ padding: "0.75rem 1rem", textAlign: "center" }}>
                            <span className={`academic-badge ${isAprobado ? "badge-blue" : "badge-gray"}`}>
                              {isAprobado ? "APROBADA" : "BORRADOR"}
                            </span>
                          </td>
                          <td style={{ padding: "0.75rem 1rem", textAlign: "right" }}>
                            <a
                              href={`#/evaluacion/planes/${row.id}`}
                              className="academic-btn-action btn-action-primary"
                              style={{ display: "inline-flex", padding: "0.35rem 0.75rem", fontSize: "0.75rem" }}
                            >
                              <ExternalLink size={12} /> Ver Plan Completo
                            </a>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </>
        )
      )}

      {creating && data && (
        <CreatePlan
          data={data}
          onClose={() => create(false)}
          onConflict={() => block(true)}
          onReload={() => {
            create(false);
            block(false);
            reload();
          }}
          onSaved={(saved) => {
            create(false);
            setCreatedPlanId(saved.plan.id);
          }}
        />
      )}
    </div>
  );
}
function CreatePlan({
  data,
  onClose,
  onSaved,
  onConflict,
  onReload,
}: {
  data: PlanList;
  onClose: () => void;
  onSaved: (value: PlanView) => void;
  onConflict: () => void;
  onReload: () => void;
}) {
  const [name, setName] = useState("");
  const [formula, setFormula] = useState("");
  const [definition, setDefinition] = useState<EvaluationDefinition>({
    evaluaciones: [],
  });
  const [review, setReview] = useState(false);
  const [attempted, attempt] = useState(false);
  const [busy, pending] = useState(false);
  const [conflict, block] = useState(false);
  const [error, fail] = useState("");
  const submitting = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || conflict) return;
    attempt(true);
    const issue = validatePlanCapture(name, formula, definition);
    fail(issue);
    if (issue) return;
    if (!review) {
      setReview(true);
      return;
    }
    submitting.current = true;
    pending(true);
    try {
      onSaved(
        await api<PlanView>(`evaluacion/niveles/${data.nivel.id}/planes`, {
          method: "POST",
          body: { nombre: name.trim(), formula, estructura: definition },
        }),
      );
    } catch (e) {
      fail(errorText(e));
      setReview(false);
      if (e instanceof ApiError && e.status === 409) {
        block(true);
        onConflict();
      }
    } finally {
      submitting.current = false;
      pending(false);
    }
  }
  return (
    <FormDialog
      title="Nueva versión"
      context={
        <Facts
          items={[
            ["Idioma", data.nivel.idioma],
            ["Nivel", data.nivel.nombre],
          ]}
        />
      }
      review={review}
      reviewLabel="Revisar borrador"
      confirmLabel="Crear borrador"
      reviewContent={
        <>
          <Facts
            items={[
              ["Nombre", name.trim()],
              ["Fórmula", formulaLabel],
            ]}
          />
          <DefinitionView value={definition} units={data.unidades} />
          <p className="notice">
            Se guardará un borrador. No se aplicará al grupo ni se aprobará
            automáticamente.
          </p>
        </>
      }
      busy={busy}
      dirty={Boolean(
        name || formula || definition.evaluaciones.length || conflict,
      )}
      blocked={conflict}
      error={error}
      onClose={onClose}
      onBack={() => setReview(false)}
      onSubmit={(event) => void submit(event)}
      onReload={conflict ? onReload : undefined}
      reloadLabel="Recargar versiones"
    >
      <PlanFields
        {...{
          name,
          formula,
          definition,
          attempted,
          setName,
          setFormula,
          setDefinition,
        }}
        units={data.unidades}
        disabled={busy || conflict}
      />
    </FormDialog>
  );
}
