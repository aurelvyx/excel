import { useState, useRef, useEffect, type FormEvent } from "react";
import { ApiError, api, errorText } from "../../shared/api";
import { FormDialog } from "../../shared/FormDialog";
import { navigate } from "../../shared/navigation";
import { useApiQuery } from "../../shared/useApiQuery";
import { Button } from "../../shared/ui/Button";
import { DataTable } from "../../shared/ui/DataTable";
import { Facts } from "../../shared/ui/Facts";
import { Feedback, Loading } from "../../shared/ui/Feedback";
import { PageHeading } from "../../shared/ui/PageHeading";
import { StatusBadge } from "../../shared/ui/StatusBadge";
import { DefinitionView } from "./EvaluationDefinition";
import { PlanFields } from "./PlanFields";
import {
  formulaLabel,
  validatePlanCapture,
  type EvaluationDefinition,
  type EvaluationLevel,
  type PlanList,
  type PlanView,
} from "./model";

export function EvaluationLevelsPage({ levelId }: { levelId?: string }) {
  return levelId ? <LevelPlans key={levelId} levelId={levelId} /> : <Levels />;
}
function Levels() {
  const { data, loading, error, reload } = useApiQuery<{
    items: EvaluationLevel[];
  }>("evaluacion/niveles");
  return (
    <section>
      <PageHeading
        eyebrow="Evaluación"
        title="Criterios de evaluación"
        description="Consulta y organiza las versiones de criterios por idioma y nivel."
      />
      {loading ? (
        <Loading>Cargando niveles…</Loading>
      ) : error ? (
        <Feedback onRetry={reload}>{error}</Feedback>
      ) : (
        <div className="panel">
          <DataTable
            caption="Niveles para evaluación"
            rows={data?.items ?? []}
            rowKey={(row) => row.id}
            emptyMessage="No hay niveles accesibles para tu cuenta."
            columns={[
              { key: "idioma", header: "Idioma", cell: (row) => row.idioma },
              { key: "nivel", header: "Nivel", cell: (row) => row.nombre },
              {
                key: "acciones",
                header: "Acciones",
                cell: (row) => (
                  <a href={`#/evaluacion/niveles/${row.id}`}>Ver versiones</a>
                ),
              },
            ]}
          />
        </div>
      )}
    </section>
  );
}
function LevelPlans({ levelId }: { levelId: string }) {
  const { data, loading, error, reload } = useApiQuery<PlanList>(
    `evaluacion/niveles/${levelId}/planes`,
  );
  const [creating, create] = useState(false);
  const [stale, block] = useState(false);
  const [createdPlanId, setCreatedPlanId] = useState<string | null>(null);
  useEffect(() => {
    // El formulario y su guard se desmontan antes de navegar al registro guardado.
    if (!creating && createdPlanId)
      navigate(`/evaluacion/planes/${createdPlanId}`);
  }, [creating, createdPlanId]);
  return (
    <section>
      <a className="back-link" href="#/evaluacion/niveles">
        ← Volver a niveles
      </a>
      <PageHeading
        eyebrow="Evaluación"
        title="Versiones de criterios"
        description={
          data
            ? `${data.nivel.idioma} · ${data.nivel.nombre}`
            : "Criterios académicos por nivel."
        }
        action={
          data?.puedeCrear && (
            <Button
              variant="primary"
              disabled={loading || !!error || stale}
              onClick={() => create(true)}
            >
              Nueva versión
            </Button>
          )
        }
      />
      {loading ? (
        <Loading>Cargando versiones…</Loading>
      ) : error ? (
        <Feedback onRetry={reload}>{error}</Feedback>
      ) : (
        data && (
          <>
            <p className="notice">
              Una versión borrador no constituye aprobación institucional. Los
              criterios aprobados se conservan y los grupos mantienen la versión
              que se les aplica.
            </p>
            <div className="panel">
              <DataTable
                caption="Versiones de criterios del nivel"
                rows={data.items}
                rowKey={(row) => row.id}
                emptyMessage="Todavía no hay versiones para este nivel."
                columns={[
                  {
                    key: "version",
                    header: "Versión",
                    cell: (row) => row.version,
                  },
                  {
                    key: "nombre",
                    header: "Nombre",
                    cell: (row) => row.nombre,
                  },
                  {
                    key: "estado",
                    header: "Estado",
                    cell: (row) => (
                      <StatusBadge inactive={row.estado === "BORRADOR"}>
                        {row.estado === "APROBADO" ? "Aprobada" : "Borrador"}
                      </StatusBadge>
                    ),
                  },
                  {
                    key: "acciones",
                    header: "Acciones",
                    cell: (row) => (
                      <a href={`#/evaluacion/planes/${row.id}`}>
                        Ver versión {row.version}
                      </a>
                    ),
                  },
                ]}
              />
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
    </section>
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
