import { useState, type FormEvent } from "react";
import { api, errorText } from "../../shared/api";
import { navigate } from "../../shared/navigation";
import { useApiQuery } from "../../shared/useApiQuery";
import { Button } from "../../shared/ui/Button";
import { DataTable } from "../../shared/ui/DataTable";
import { Feedback, Loading } from "../../shared/ui/Feedback";
import { InputField, SelectField } from "../../shared/ui/Field";
import { ListPanel } from "../../shared/ui/ListPanel";
import { PageHeading } from "../../shared/ui/PageHeading";
import { Pagination } from "../../shared/ui/Pagination";
import { StatusBadge } from "../../shared/ui/StatusBadge";
import { AttendanceSummary } from "./AttendanceSummary";
import { GroupContext } from "./GroupContext";
import { JustificationDialog } from "./JustificationDialog";
import {
  justificationStates,
  type JustificationAction,
  type JustificationDetail,
  type JustificationRow,
  type JustificationsPageData,
} from "./justification-model";
import { sessionDate } from "./model";

export function JustificationsPage({
  groupId,
  query,
}: {
  groupId: string;
  query: URLSearchParams;
}) {
  const path = `/asistencia/grupos/${groupId}/justificaciones`;
  const endpoint = `asistencia/grupos/${groupId}/justificaciones`;
  const search = new URLSearchParams({ limit: "20" });
  for (const key of ["after", "estado", "q"]) {
    const value = query.get(key);
    if (value) search.set(key, value);
  }
  const queryPath = `${endpoint}?${search}`;
  const { data, loading, error, reload } =
    useApiQuery<JustificationsPageData>(queryPath);
  if (!loading && !error && data)
    return (
      <JustificationsList
        key={queryPath}
        initial={data}
        path={path}
        endpoint={endpoint}
        query={query}
        queryPath={queryPath}
      />
    );
  return (
    <section>
      <a href={`#/asistencia/grupos/${groupId}`} className="back-link">
        ← Volver a sesiones
      </a>
      <JustificationsHeading />
      {loading ? (
        <Loading>Cargando justificaciones…</Loading>
      ) : (
        <Feedback onRetry={reload}>{error}</Feedback>
      )}
    </section>
  );
}

function JustificationsHeading() {
  return (
    <PageHeading
      eyebrow="Asistencia"
      title="Justificaciones"
      description="Registra las solicitudes sobre marcas J y consulta su resolución y recuperación."
    />
  );
}

function JustificationsList({
  initial,
  path,
  endpoint,
  query,
  queryPath,
}: {
  initial: JustificationsPageData;
  path: string;
  endpoint: string;
  query: URLSearchParams;
  queryPath: string;
}) {
  const [snapshot, setSnapshot] = useState(initial);
  const [selected, select] = useState<{
    row: JustificationDetail;
    action: JustificationAction;
  } | null>(null);
  const [opening, setOpening] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [summaryCurrent, setSummaryCurrent] = useState(true);
  const [error, fail] = useState("");
  const [refreshError, failRefresh] = useState("");
  const [success, notify] = useState("");
  const serialized = query.toString();
  const busy = opening || refreshing;
  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    failRefresh("");
    try {
      setSnapshot(await api<JustificationsPageData>(queryPath));
      setSummaryCurrent(true);
    } catch (e) {
      setSummaryCurrent(false);
      failRefresh(
        `No se pudo actualizar el listado. ${errorText(e)} Los resúmenes no están actualizados; recarga las justificaciones antes de continuar.`,
      );
    } finally {
      setRefreshing(false);
    }
  }
  async function open(row: JustificationRow, action: JustificationAction) {
    if (busy) return;
    setOpening(true);
    fail("");
    try {
      const current = row.justificacion
        ? await api<JustificationDetail>(`${endpoint}/${row.justificacion.id}`)
        : row;
      select({ row: current, action });
    } catch (e) {
      fail(errorText(e));
    } finally {
      setOpening(false);
    }
  }
  function saved(row: JustificationRow) {
    const messages: Record<string, string> = {
      REGISTER: "Justificación registrada, pendiente de resolución.",
      RESOLVE: "Resolución registrada.",
      RECOVER: "Recuperación registrada.",
    };
    notify(messages[selected!.action]);
    select(null);
    fail("");
    setSnapshot((old) => ({
      ...old,
      items: old.items.map((item) =>
        item.asistencia_id === row.asistencia_id ? row : item,
      ),
    }));
    setSummaryCurrent(false);
    void refresh();
  }
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    for (const key of ["q", "estado"]) {
      const value = String(form.get(key) ?? "").trim();
      if (value) next.set(key, value);
    }
    navigate(next.size ? `${path}?${next}` : path);
  }
  return (
    <section>
      <a
        href={`#/asistencia/grupos/${snapshot.grupo.id}`}
        className="back-link"
      >
        ← Volver a sesiones
      </a>
      <JustificationsHeading />
      <GroupContext group={snapshot.grupo} />
      <p className="notice">
        Una marca J sin solicitud es distinta de una solicitud pendiente. Las
        solicitudes pendientes y aprobadas con recuperación pendiente computan
        provisionalmente; la marca original y las decisiones se conservan.
      </p>
      <Feedback tone="success">{success}</Feedback>
      <Feedback>{error}</Feedback>
      <Feedback tone="notice">{refreshError}</Feedback>
      <ListPanel
        loading={false}
        loadingLabel="Cargando justificaciones…"
        error=""
        onRetry={() => void refresh()}
        empty={!snapshot.items.length}
        emptyDescription="No hay marcas J ni solicitudes que coincidan con esta consulta."
        filters={
          <>
            <form className="filters" key={serialized} onSubmit={search}>
              <InputField
                label="Estudiante, documento o matrícula"
                name="q"
                maxLength={120}
                defaultValue={query.get("q") ?? ""}
                disabled={busy}
              />
              <SelectField
                label="Estado de solicitud"
                name="estado"
                defaultValue={query.get("estado") ?? ""}
                disabled={busy}
              >
                <option value="">Todos</option>
                {Object.entries(justificationStates).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </SelectField>
              <Button type="submit" disabled={busy}>
                Buscar
              </Button>
              <Button
                disabled={busy || !serialized}
                onClick={() => navigate(path)}
              >
                Limpiar filtros
              </Button>
            </form>
            <div className="selection-toolbar attendance-toolbar">
              <Button
                busy={refreshing}
                disabled={opening}
                busyLabel="Actualizando…"
                onClick={() => void refresh()}
              >
                Recargar justificaciones
              </Button>
              {opening && <span role="status">Abriendo justificación…</span>}
            </div>
          </>
        }
        pagination={
          <Pagination
            count={snapshot.items.length}
            after={query.get("after")}
            nextCursor={busy ? null : snapshot.nextCursor}
            onChange={(cursor) => {
              if (busy) return;
              const next = new URLSearchParams(serialized);
              if (cursor) next.set("after", cursor);
              else next.delete("after");
              navigate(next.size ? `${path}?${next}` : path);
            }}
          />
        }
      >
        <DataTable
          caption="Justificaciones del grupo"
          rows={snapshot.items}
          rowKey={(row) => row.asistencia_id}
          columns={[
            {
              key: "estudiante",
              header: "Estudiante",
              cell: (row) => (
                <>
                  {row.estudiante}
                  <small className="attendance-document">
                    {row.tipo_documento} {row.numero_documento}
                  </small>
                </>
              ),
            },
            {
              key: "matricula",
              header: "Matrícula / intento",
              cell: (row) => (
                <>
                  {row.codigo_matricula}
                  <small className="attendance-document">
                    Intento {row.numero_intento} · {row.estado_matricula}
                  </small>
                </>
              ),
            },
            {
              key: "sesion",
              header: "Clase / marca original",
              cell: (row) => (
                <>
                  <a
                    href={`#/asistencia/grupos/${snapshot.grupo.id}/sesiones/${row.sesion_id}`}
                  >
                    {sessionDate(row.fecha_sesion)}
                  </a>
                  <small className="attendance-document">
                    J · Falta justificada
                  </small>
                </>
              ),
            },
            {
              key: "estado",
              header: "Solicitud",
              cell: (row) => (
                <>
                  <StatusBadge
                    inactive={row.justificacion?.estado !== "RECUPERADA"}
                  >
                    {
                      justificationStates[
                        row.justificacion?.estado ?? "SIN_SOLICITUD"
                      ]
                    }
                  </StatusBadge>
                  {row.justificacion && (
                    <small className="attendance-document">
                      Presentada:{" "}
                      {sessionDate(row.justificacion.fecha_presentacion)}
                    </small>
                  )}
                </>
              ),
            },
            {
              key: "resumen",
              header: "Resumen del intento",
              className: "attendance-calculation",
              cell: (row) => (
                <AttendanceSummary
                  summary={row.resumenAsistencia}
                  label={`Resumen de asistencia de ${row.estudiante}`}
                  compact
                  stale={!summaryCurrent}
                />
              ),
            },
            {
              key: "acciones",
              header: "Acciones",
              className: "row-actions",
              cell: (row) => (
                <>
                  {row.puedeRegistrar && (
                    <Button
                      variant="link"
                      disabled={busy || !summaryCurrent}
                      onClick={() => void open(row, "REGISTER")}
                    >
                      Registrar justificación
                    </Button>
                  )}
                  {row.puedeResolver && (
                    <Button
                      variant="link"
                      disabled={busy || !summaryCurrent}
                      onClick={() => void open(row, "RESOLVE")}
                    >
                      Resolver justificación
                    </Button>
                  )}
                  {row.puedeConfirmarRecuperacion && (
                    <Button
                      variant="link"
                      disabled={busy || !summaryCurrent}
                      onClick={() => void open(row, "RECOVER")}
                    >
                      Confirmar recuperación
                    </Button>
                  )}
                  <Button
                    variant="link"
                    disabled={busy}
                    onClick={() => void open(row, "DETAIL")}
                  >
                    Ver detalle
                  </Button>
                  {row.motivoSoloLectura && (
                    <small className="readonly-reason">
                      Solo lectura · {row.motivoSoloLectura}
                    </small>
                  )}
                </>
              ),
            },
          ]}
        />
      </ListPanel>
      {selected && (
        <JustificationDialog
          key={`${selected.row.asistencia_id}:${selected.action}`}
          row={selected.row}
          action={selected.action}
          today={snapshot.hoy}
          endpoint={endpoint}
          onClose={() => select(null)}
          onSaved={saved}
          onConflict={() => setSummaryCurrent(false)}
          onReload={() => {
            select(null);
            void refresh();
          }}
        />
      )}
    </section>
  );
}
