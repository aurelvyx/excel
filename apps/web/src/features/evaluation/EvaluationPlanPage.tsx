import { useRef, useState, type FormEvent } from "react";
import { ApiError, api, errorText } from "../../shared/api";
import { useApiQuery } from "../../shared/useApiQuery";
import { useUnsavedChanges } from "../../shared/useUnsavedChanges";
import { Button } from "../../shared/ui/Button";
import { DataTable } from "../../shared/ui/DataTable";
import { Facts } from "../../shared/ui/Facts";
import { Feedback, Loading } from "../../shared/ui/Feedback";
import { PageHeading } from "../../shared/ui/PageHeading";
import { academicTime } from "../attendance/model";
import { DefinitionView } from "./EvaluationDefinition";
import { EvaluationActionDialog } from "./EvaluationActionDialog";
import { PlanFields } from "./PlanFields";
import { formulaLabel, validatePlanCapture, type PlanView } from "./model";

export function EvaluationPlanPage({ planId }: { planId: string }) {
  const endpoint = `evaluacion/planes/${planId}`;
  const { data, loading, error, reload } = useApiQuery<PlanView>(endpoint);
  if (!loading && !error && data)
    return <PlanDetail key={endpoint} initial={data} endpoint={endpoint} />;
  return (
    <section>
      <PageHeading
        eyebrow="Evaluación"
        title="Versión de criterios"
        description="Consulta los criterios académicos registrados."
      />
      {loading ? (
        <Loading>Cargando versión…</Loading>
      ) : (
        <Feedback onRetry={reload}>{error}</Feedback>
      )}
    </section>
  );
}
function PlanDetail({
  initial,
  endpoint,
}: {
  initial: PlanView;
  endpoint: string;
}) {
  const [data, setData] = useState(initial);
  const [name, setName] = useState(initial.plan.nombre);
  const [formula, setFormula] = useState(initial.plan.formula);
  const [definition, setDefinition] = useState(initial.plan.estructura);
  const [approval, approve] = useState(false);
  const [busy, pending] = useState(false);
  const [stale, block] = useState(false);
  const [attempted, attempt] = useState(false);
  const [error, fail] = useState("");
  const [success, notify] = useState("");
  const submitting = useRef(false);
  const dirty =
    name !== data.plan.nombre ||
    formula !== data.plan.formula ||
    JSON.stringify(definition) !== JSON.stringify(data.plan.estructura);
  const guard = useUnsavedChanges(dirty, busy);
  function replace(next: PlanView) {
    setData(next);
    setName(next.plan.nombre);
    setFormula(next.plan.formula);
    setDefinition(next.plan.estructura);
    block(false);
    attempt(false);
    fail("");
  }
  async function refresh() {
    pending(true);
    fail("");
    try {
      replace(await api<PlanView>(endpoint));
      approve(false);
    } catch (e) {
      fail(errorText(e));
      block(true);
    } finally {
      pending(false);
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || stale || !data.puedeEditar) return;
    attempt(true);
    notify("");
    const issue = validatePlanCapture(name, formula, definition);
    fail(issue);
    if (issue) return;
    submitting.current = true;
    pending(true);
    try {
      replace(
        await api<PlanView>(endpoint, {
          method: "PATCH",
          body: {
            revision: data.plan.revision,
            nombre: name.trim(),
            formula,
            estructura: definition,
          },
        }),
      );
      notify("Borrador guardado. Revisa la validación antes de aprobar.");
    } catch (e) {
      fail(errorText(e));
      if (e instanceof ApiError && e.status === 409) block(true);
    } finally {
      submitting.current = false;
      pending(false);
    }
  }
  const actions = {
    CREATE_EVALUATION_PLAN: "Creación de borrador",
    UPDATE_EVALUATION_PLAN: "Actualización de borrador",
    APPROVE_EVALUATION_PLAN: "Aprobación de criterios",
  };
  return (
    <section>
      <a className="back-link" href={`#/evaluacion/niveles/${data.nivel.id}`}>
        ← Volver a versiones
      </a>
      <PageHeading
        eyebrow={`${data.nivel.idioma} · ${data.nivel.nombre}`}
        title={`Versión ${data.plan.version} de criterios`}
        description={data.plan.nombre}
        action={
          <Button
            disabled={busy}
            onClick={() => guard.request(() => void refresh())}
          >
            Recargar versión
          </Button>
        }
      />
      <Feedback tone="success">{success}</Feedback>
      <Feedback>{error}</Feedback>
      {stale && (
        <Feedback tone="notice">
          La captura se conserva. Recarga explícitamente la versión antes de
          continuar; la validación anterior ya no se muestra.
        </Feedback>
      )}
      <section className="panel panel-content evaluation-plan">
        <Facts
          items={[
            [
              "Estado",
              data.plan.estado === "APROBADO" ? "Aprobada" : "Borrador",
            ],
            ["Creada por", data.plan.creado_nombre],
            ["Fecha de creación", academicTime(data.plan.creado_at)],
          ]}
        />
        {!data.puedeEditar && (
          <p className="readonly">
            Solo lectura ·{" "}
            {data.motivoSoloLectura ?? "Esta versión no admite modificaciones."}
          </p>
        )}
        {data.plan.estado === "APROBADO" && (
          <section aria-label="Aprobación registrada">
            <Facts
              items={[
                ["Aprobada por", data.plan.aprobado_nombre],
                [
                  "Fecha de aprobación",
                  data.plan.aprobado_at
                    ? academicTime(data.plan.aprobado_at)
                    : null,
                ],
                ["Referencia de aprobación", data.plan.referencia_aprobacion],
                ["Fórmula", formulaLabel],
              ]}
            />
          </section>
        )}
        {data.puedeEditar ? (
          <form noValidate onSubmit={(event) => void save(event)}>
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
              disabled={busy || stale || approval}
            />
            <footer className="actions">
              <Button
                type="submit"
                variant="primary"
                busy={busy}
                disabled={stale || !dirty || approval}
              >
                Guardar borrador
              </Button>
            </footer>
          </form>
        ) : (
          <DefinitionView value={data.plan.estructura} units={data.unidades} />
        )}
      </section>
      {!dirty && !stale ? (
        <section
          className="panel panel-content"
          aria-label="Validación de criterios"
        >
          <h2>Validación de criterios</h2>
          <Facts
            items={[
              [
                "Configuración",
                data.validacion.completa
                  ? "Completa para aprobación"
                  : "Incompleta",
              ],
              [
                "Peso total de evaluaciones",
                `${data.validacion.pesoTotalPct} %`,
              ],
              ["Evaluaciones", data.validacion.evaluaciones],
              ["Indicadores", data.validacion.indicadores],
            ]}
          />
          {data.validacion.errores.length > 0 && (
            <ul>
              {data.validacion.errores.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
          {data.puedeAprobar && (
            <Button
              variant="primary"
              disabled={busy || !data.validacion.completa}
              onClick={() => approve(true)}
            >
              Aprobar versión
            </Button>
          )}
        </section>
      ) : (
        !stale && (
          <p className="notice">
            Guarda el borrador para consultar su validación vigente antes de
            aprobar.
          </p>
        )
      )}
      <details className="panel panel-content">
        <summary>Ver historial de criterios</summary>
        <DataTable
          caption="Historial de criterios"
          rows={data.historial}
          rowKey={(row) => row.id}
          emptyMessage="No hay eventos disponibles."
          columns={[
            {
              key: "accion",
              header: "Acción",
              cell: (row) =>
                actions[row.accion as keyof typeof actions] ?? row.accion,
            },
            {
              key: "responsable",
              header: "Responsable",
              cell: (row) => row.nombre_usuario,
            },
            {
              key: "fecha",
              header: "Fecha",
              cell: (row) => academicTime(row.ocurrido_at),
            },
            {
              key: "motivo",
              header: "Referencia o motivo",
              cell: (row) => row.motivo ?? "—",
            },
          ]}
        />
      </details>
      {approval && (
        <EvaluationActionDialog<PlanView>
          kind="approve"
          endpoint={`${endpoint}/aprobacion`}
          plan={data.plan}
          units={data.unidades}
          onClose={() => approve(false)}
          onSaved={(next) => {
            replace(next);
            approve(false);
            notify(
              "Versión aprobada. Los criterios se conservarán sin modificaciones.",
            );
          }}
          onConflict={() => block(true)}
          onReload={() => void refresh()}
        />
      )}
      {guard.confirmation}
    </section>
  );
}
