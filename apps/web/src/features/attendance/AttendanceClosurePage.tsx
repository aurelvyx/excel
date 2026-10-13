import { useRef, useState, type FormEvent } from "react";
import { ApiError, api, errorText } from "../../shared/api";
import { FormDialog } from "../../shared/FormDialog";
import { useApiQuery } from "../../shared/useApiQuery";
import { Button } from "../../shared/ui/Button";
import { DataTable } from "../../shared/ui/DataTable";
import { Facts } from "../../shared/ui/Facts";
import { Feedback, Loading } from "../../shared/ui/Feedback";
import { InputField, TextAreaField } from "../../shared/ui/Field";
import { PageHeading } from "../../shared/ui/PageHeading";
import { AttendanceSummary } from "./AttendanceSummary";
import { ClosureWarnings } from "./ClosureWarnings";
import { GroupContext } from "./GroupContext";
import {
  needsClosureAcknowledgement,
  type AttendanceClosureData,
} from "./closure-model";
import { academicTime } from "./model";

export function AttendanceClosurePage({ groupId }: { groupId: string }) {
  const endpoint = `asistencia/grupos/${groupId}/cierre`;
  const { data, loading, error, reload } =
    useApiQuery<AttendanceClosureData>(endpoint);
  if (!loading && !error && data)
    return <ClosureReview key={endpoint} initial={data} endpoint={endpoint} />;
  return (
    <section>
      <a className="back-link" href={`#/asistencia/grupos/${groupId}`}>
        ← Volver a sesiones
      </a>
      <ClosureHeading />
      {loading ? (
        <Loading>Cargando cierre de asistencia…</Loading>
      ) : (
        <Feedback onRetry={reload}>{error}</Feedback>
      )}
    </section>
  );
}
function ClosureHeading({ action }: { action?: React.ReactNode }) {
  return (
    <PageHeading
      eyebrow="Asistencia"
      title="Cierre de asistencia"
      description="Revisa el grupo completo y confirma el cierre del registro de asistencia."
      action={action}
    />
  );
}
function ClosureReview({
  initial,
  endpoint,
}: {
  initial: AttendanceClosureData;
  endpoint: string;
}) {
  const [data, setData] = useState(initial);
  const [closing, setClosing] = useState(false);
  const [busy, pending] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, fail] = useState("");
  const [success, notify] = useState("");
  async function refresh() {
    pending(true);
    fail("");
    try {
      setData(await api<AttendanceClosureData>(endpoint));
      setStale(false);
    } catch (e) {
      fail(errorText(e));
      setStale(true);
    } finally {
      pending(false);
    }
  }
  return (
    <section>
      <a className="back-link" href={`#/asistencia/grupos/${data.grupo.id}`}>
        ← Volver a sesiones
      </a>
      <ClosureHeading
        action={
          data.puedeCerrar && (
            <Button
              variant="primary"
              disabled={busy || stale}
              onClick={() => setClosing(true)}
            >
              Cerrar asistencia
            </Button>
          )
        }
      />
      <GroupContext group={data.grupo} />
      <Feedback tone="success">{success}</Feedback>
      <Feedback>{error}</Feedback>
      {!data.puedeCerrar && (
        <Feedback tone="notice">
          Solo lectura ·{" "}
          {data.motivoSoloLectura ??
            "Consulta el cierre registrado de este grupo."}
        </Feedback>
      )}
      <section className="panel closure-review">
        {data.cierre && (
          <section aria-label="Cierre registrado">
            <h2>Asistencia cerrada</h2>
            <Facts
              emptyLabel="Sin motivo adicional"
              items={[
                ["Cerrada por", data.cierre.realizado_nombre],
                ["Fecha del cierre", academicTime(data.cierre.realizado_at)],
                ["Motivo del cierre", data.cierre.motivo],
              ]}
            />
          </section>
        )}
        <ClosureWarnings warnings={data.advertencias} stale={stale} />
        <p className="help">
          Después del cierre, el docente no podrá registrar ni corregir
          asistencia. La programación, matrícula y gestión ordinaria de
          justificaciones quedarán bloqueadas. Las correcciones posteriores
          requieren administrador y motivo.
        </p>
        <Button
          busy={busy}
          busyLabel="Actualizando…"
          onClick={() => void refresh()}
        >
          Recargar cierre
        </Button>
      </section>
      <DataTable
        caption="Asistencia por intento para el cierre"
        rows={data.items}
        rowKey={(row) => row.matricula_id}
        emptyMessage="No hay matrículas revisables."
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
            key: "resumen",
            header: "Resumen del intento",
            className: "attendance-calculation",
            cell: (row) => (
              <AttendanceSummary
                summary={row.resumenAsistencia}
                label={`Resumen de asistencia de ${row.estudiante}`}
                compact
                stale={stale}
              />
            ),
          },
        ]}
      />
      {!!data.historial.length && (
        <section className="panel closure-review">
          <h2>Historial del cierre</h2>
          <DataTable
            caption="Historial de cierre de asistencia"
            rows={data.historial}
            rowKey={(event) => event.id}
            columns={[
              { key: "estado", header: "Estado", cell: () => "Cerrado" },
              {
                key: "usuario",
                header: "Responsable",
                cell: (event) => event.realizado_nombre,
              },
              {
                key: "fecha",
                header: "Fecha",
                cell: (event) => academicTime(event.realizado_at),
              },
              {
                key: "motivo",
                header: "Motivo",
                cell: (event) => event.motivo || "Sin motivo adicional",
              },
            ]}
          />
        </section>
      )}
      {closing && (
        <ClosureForm
          data={data}
          endpoint={endpoint}
          onClose={() => setClosing(false)}
          onSaved={(saved) => {
            setData(saved);
            setStale(false);
            setClosing(false);
            notify("Asistencia cerrada.");
            fail("");
          }}
          onConflict={() => setStale(true)}
          onReload={() => {
            setClosing(false);
            void refresh();
          }}
        />
      )}
    </section>
  );
}
function ClosureForm({
  data,
  endpoint,
  onClose,
  onSaved,
  onConflict,
  onReload,
}: {
  data: AttendanceClosureData;
  endpoint: string;
  onClose: () => void;
  onSaved: (data: AttendanceClosureData) => void;
  onConflict: () => void;
  onReload: () => void;
}) {
  const [reason, setReason] = useState("");
  const [acknowledged, acknowledge] = useState(false);
  const [review, confirm] = useState(false);
  const [busy, pending] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [error, fail] = useState("");
  const submitting = useRef(false);
  const needsAcknowledgement = needsClosureAcknowledgement(data.advertencias);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || conflict) return;
    const next: Record<string, string> = {};
    if (reason.trim().length > 400)
      next.reason = "El motivo admite hasta 400 caracteres.";
    if (needsAcknowledgement && !acknowledged)
      next.acknowledged =
        "Confirma que revisaste los pendientes y las advertencias.";
    setIssues(next);
    if (Object.keys(next).length) {
      const form = event.currentTarget;
      setTimeout(
        () => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
        0,
      );
      return;
    }
    if (!review) {
      confirm(true);
      return;
    }
    submitting.current = true;
    pending(true);
    fail("");
    try {
      onSaved(
        await api<AttendanceClosureData>(endpoint, {
          method: "POST",
          body: {
            revision: data.revision,
            motivo: reason.trim() || null,
            confirmarPendientes: acknowledged,
          },
        }),
      );
    } catch (e) {
      fail(errorText(e));
      confirm(false);
      if (e instanceof ApiError && e.status === 409) {
        setConflict(true);
        onConflict();
      }
    } finally {
      submitting.current = false;
      pending(false);
    }
  }
  return (
    <FormDialog
      title="Cerrar asistencia"
      context={
        <>
          <p>
            Grupo {data.grupo.codigo} · {data.grupo.contexto.periodo} ·{" "}
            {data.grupo.contexto.idioma} · {data.grupo.contexto.nivel}
          </p>
          <ClosureWarnings warnings={data.advertencias} stale={conflict} />
        </>
      }
      review={review}
      reviewLabel="Revisar cierre"
      confirmLabel="Confirmar cierre"
      reviewContent={
        <>
          <p>Motivo: {reason.trim() || "Sin motivo adicional"}</p>
          <p className="notice">
            Al confirmar se cerrará la asistencia y se bloqueará la edición
            docente. Las J no recuperadas computarán como falta; las marcas sin
            registrar seguirán pendientes. Esta pantalla no permite reabrir la
            asistencia.
          </p>
        </>
      }
      busy={busy}
      dirty={Boolean(reason || acknowledged || conflict)}
      blocked={conflict}
      error={error}
      onClose={onClose}
      onBack={() => confirm(false)}
      onSubmit={(event) => void submit(event)}
      onReload={conflict ? onReload : undefined}
      reloadLabel="Recargar cierre"
    >
      <TextAreaField
        label="Motivo del cierre"
        value={reason}
        rows={3}
        maxLength={400}
        hint="Opcional · máximo 400 caracteres."
        disabled={busy || conflict}
        error={issues.reason}
        onChange={(event) => {
          setReason(event.target.value);
          setIssues((old) => ({ ...old, reason: "" }));
        }}
      />
      {needsAcknowledgement && (
        <InputField
          type="checkbox"
          label="Confirmo que revisé los pendientes y las advertencias"
          checked={acknowledged}
          disabled={busy || conflict}
          error={issues.acknowledged}
          onChange={(event) => {
            acknowledge(event.target.checked);
            setIssues((old) => ({ ...old, acknowledged: "" }));
          }}
        />
      )}
    </FormDialog>
  );
}
