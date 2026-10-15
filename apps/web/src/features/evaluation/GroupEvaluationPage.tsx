import { useState } from "react";
import { api, errorText } from "../../shared/api";
import { useApiQuery } from "../../shared/useApiQuery";
import { Button } from "../../shared/ui/Button";
import { Facts } from "../../shared/ui/Facts";
import { Feedback, Loading } from "../../shared/ui/Feedback";
import { PageHeading } from "../../shared/ui/PageHeading";
import { GroupContext } from "../attendance/GroupContext";
import { academicTime } from "../attendance/model";
import { EvaluationActionDialog } from "./EvaluationActionDialog";
import { DefinitionView } from "./EvaluationDefinition";
import { formulaLabel, type GroupEvaluationView } from "./model";

export function GroupEvaluationPage({ groupId }: { groupId: string }) {
  const endpoint = `evaluacion/grupos/${groupId}/configuracion`;
  const { data, loading, error, reload } =
    useApiQuery<GroupEvaluationView>(endpoint);
  if (!loading && !error && data)
    return (
      <GroupEvaluation key={endpoint} initial={data} endpoint={endpoint} />
    );
  return (
    <section>
      <a className="back-link" href={`#/asistencia/grupos/${groupId}`}>
        ← Volver a sesiones
      </a>
      <PageHeading
        eyebrow="Evaluación"
        title="Evaluaciones del grupo"
        description="Consulta los criterios y los pendientes de calificación del grupo."
      />
      {loading ? (
        <Loading>Cargando evaluaciones…</Loading>
      ) : (
        <Feedback onRetry={reload}>{error}</Feedback>
      )}
    </section>
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
    <section>
      <a className="back-link" href={`#/asistencia/grupos/${data.grupo.id}`}>
        ← Volver a sesiones
      </a>
      <PageHeading
        eyebrow="Evaluación"
        title="Evaluaciones del grupo"
        description="Aplica una versión aprobada y consulta los criterios que conserva este grupo."
        action={
          data.puedeAplicar && (
            <Button
              variant="primary"
              disabled={
                busy || stale || data.planesDisponibles.length === 0 || applying
              }
              onClick={() => apply(true)}
            >
              Aplicar versión aprobada
            </Button>
          )
        }
      />
      <GroupContext group={data.grupo} />
      <p>
        <a href={`#/evaluacion/grupos/${data.grupo.id}/calificaciones`}>
          Calificaciones
        </a>
      </p>
      <Feedback tone="success">{success}</Feedback>
      <Feedback>{error}</Feedback>
      {!data.puedeAplicar && (
        <p className="readonly">
          Solo lectura ·{" "}
          {data.motivoSoloLectura ??
            "La configuración del grupo se conserva sin modificaciones."}
        </p>
      )}
      <section className="panel panel-content">
        {data.configuracion && data.plan ? (
          <>
            <h2>Criterios aplicados</h2>
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
            <a href={`#/evaluacion/planes/${data.plan.id}`}>
              Consultar versión aplicada
            </a>
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
          </>
        ) : (
          <>
            <h2>Sin criterios aplicados</h2>
            <p>
              Selecciona una versión aprobada del nivel para conservarla en este
              grupo.
            </p>
            {data.planesDisponibles.length === 0 && (
              <p className="notice">
                No hay versiones aprobadas disponibles para este nivel.
              </p>
            )}
            <a href={`#/evaluacion/niveles/${data.nivel.id}`}>
              Consultar versiones del nivel
            </a>
          </>
        )}
        <div className="actions">
          <Button disabled={busy || applying} onClick={() => void refresh()}>
            Recargar configuración
          </Button>
        </div>
      </section>
      {stale ? (
        <p className="notice">
          La configuración cambió o no pudo consultarse. Recarga explícitamente
          antes de continuar; los pendientes anteriores no se muestran.
        </p>
      ) : (
        <section
          className="panel panel-content"
          aria-label="Preparación del acta"
        >
          <h2>Preparación del acta</h2>
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
            <ul>
              {readiness.motivos.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
          <p className="help">
            La preparación del acta indica si faltan criterios o calificaciones.
            No realiza el cierre.
          </p>
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
    </section>
  );
}
