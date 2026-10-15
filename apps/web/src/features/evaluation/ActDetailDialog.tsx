import { useState } from "react";
import { api } from "../../shared/api";
import { Dialog } from "../../shared/Dialog";
import { useApiQuery } from "../../shared/useApiQuery";
import { Button } from "../../shared/ui/Button";
import { DataTable } from "../../shared/ui/DataTable";
import { Facts } from "../../shared/ui/Facts";
import { Feedback, Loading } from "../../shared/ui/Feedback";
import { InputField, SelectField, TextAreaField } from "../../shared/ui/Field";
import { AttendanceSummary } from "../attendance/AttendanceSummary";
import {
  attendanceCodes,
  sessionDate,
  type AttendanceCode,
} from "../attendance/model";
import { AcademicResultSummary } from "./AcademicResultSummary";
import { ActActionDialog } from "./ActActionDialog";
import { ActHistory, StoredResultFacts } from "./ActHistory";
import { GradeSummary } from "./GradeSummary";
import {
  captureGradeError,
  displayedGrade,
  gradeCaptureValue,
} from "./grade-capture";
import type { ActDetail, ActRow } from "./acts-model";

export type ActCorrection = "grade" | "attendance";
export function ActDetailDialog({
  row,
  endpoint,
  initialAction,
  onClose,
  onSaved,
  onConflict,
  onReload,
}: {
  row: ActRow;
  endpoint: string;
  initialAction?: ActCorrection;
  onClose: () => void;
  onSaved: (changed: boolean) => Promise<void>;
  onConflict: () => void;
  onReload: () => void;
}) {
  const { data, loading, error, reload } = useApiQuery<ActDetail>(
    `${endpoint}/${row.matricula_id}`,
  );
  const [action, setAction] = useState(initialAction);
  if (!loading && !error && data && action && data.puedeCorregir)
    return (
      <ActCorrectionDialog
        data={data}
        kind={action}
        endpoint={endpoint}
        onClose={onClose}
        onSaved={onSaved}
        onConflict={onConflict}
        onReload={onReload}
      />
    );
  return (
    <Dialog title="Detalle e historial del intento" onClose={onClose}>
      <p>
        {row.estudiante} · {row.codigo_matricula} · Intento {row.numero_intento}
      </p>
      {loading ? (
        <Loading>Cargando detalle del acta…</Loading>
      ) : error ? (
        <Feedback onRetry={reload}>{error}</Feedback>
      ) : (
        data && (
          <>
            <AcademicResultSummary
              label="Condición actual del intento"
              condition={data.item.calculo.condicion}
              pending={data.item.calculo.pendientes}
              confirmed={
                !!data.cierre &&
                data.item.resultado?.cierre_id === data.cierre.id &&
                !!data.item.resultado.confirmado_at
              }
            />
            <AttendanceSummary
              summary={data.item.resumenAsistencia}
              label="Asistencia actual del intento"
              compact
            />
            <GradeSummary
              summary={data.item.resumenNotas}
              label="Calificaciones actuales del intento"
              stale={false}
            />
            <h3>Resultado guardado</h3>
            <StoredResultFacts result={data.item.resultado} />
            {data.puedeCorregir ? (
              <p className="actions">
                <Button onClick={() => setAction("grade")}>
                  Corregir nota
                </Button>
                <Button onClick={() => setAction("attendance")}>
                  Corregir asistencia
                </Button>
              </p>
            ) : (
              <p className="readonly">
                Solo lectura · La corrección requiere administración y un
                resultado confirmado en el acta actual.
              </p>
            )}
            <DataTable
              caption="Calificaciones del intento"
              rows={data.calificaciones}
              rowKey={(grade) => grade.id}
              emptyMessage="No hay notas registradas."
              columns={[
                {
                  key: "evaluacion",
                  header: "Evaluación",
                  cell: (grade) => grade.evaluacion,
                },
                {
                  key: "indicador",
                  header: "Indicador",
                  cell: (grade) => grade.indicador,
                },
                {
                  key: "nota",
                  header: "Nota guardada",
                  cell: (grade) => displayedGrade(grade.nota),
                },
              ]}
            />
            <DataTable
              caption="Asistencias del intento"
              rows={data.sesiones}
              rowKey={(session) => session.id}
              emptyMessage="No hay sesiones registradas."
              columns={[
                {
                  key: "fecha",
                  header: "Fecha de clase",
                  cell: (session) => sessionDate(session.fecha),
                },
                {
                  key: "computable",
                  header: "Incluida en el cálculo",
                  cell: (session) => (session.computable ? "Sí" : "No"),
                },
                {
                  key: "marca",
                  header: "Marca guardada",
                  cell: (session) =>
                    session.asistencia
                      ? `${session.asistencia.codigo} · ${attendanceCodes[session.asistencia.codigo]}`
                      : "Pendiente",
                },
                {
                  key: "observacion",
                  header: "Observación",
                  cell: (session) =>
                    session.asistencia?.observacion || "Sin observación",
                },
              ]}
            />
            <h3>Historial de resultados del intento</h3>
            <ActHistory
              items={data.historial}
              labels={{ [row.matricula_id]: row.codigo_matricula }}
            />
          </>
        )
      )}
    </Dialog>
  );
}

function ActCorrectionDialog({
  data,
  kind,
  endpoint,
  onClose,
  onSaved,
  onConflict,
  onReload,
}: {
  data: ActDetail;
  kind: ActCorrection;
  endpoint: string;
  onClose: () => void;
  onSaved: (changed: boolean) => Promise<void>;
  onConflict: () => void;
  onReload: () => void;
}) {
  const [selectedId, select] = useState(
    kind === "grade"
      ? (data.calificaciones[0]?.id ?? "")
      : (data.sesiones.find(
          (session) => session.computable && session.asistencia,
        )?.id ?? ""),
  );
  const grade = data.calificaciones.find((item) => item.id === selectedId);
  const session = data.sesiones.find((item) => item.id === selectedId);
  const [note, setNote] = useState(
    kind === "grade" ? (grade?.nota.replace(".", ",") ?? "") : "",
  );
  const [code, setCode] = useState<AttendanceCode | "">(
    session?.asistencia?.codigo ?? "",
  );
  const [observation, setObservation] = useState(
    session?.asistencia?.observacion ?? "",
  );
  const { item } = data;
  function choose(value: string) {
    select(value);
    if (kind === "grade")
      setNote(
        data.calificaciones
          .find((entry) => entry.id === value)
          ?.nota.replace(".", ",") ?? "",
      );
    else {
      const chosen = data.sesiones.find((entry) => entry.id === value);
      setCode(chosen?.asistencia?.codigo ?? "");
      setObservation(chosen?.asistencia?.observacion ?? "");
    }
  }
  const validate = () => {
    const issues: Record<string, string> = {};
    if (kind === "grade") {
      if (!grade) issues.selection = "Selecciona una calificación registrada.";
      const issue = captureGradeError(note);
      if (issue) issues.note = issue;
    } else {
      if (!session?.computable || !session.asistencia)
        issues.selection =
          "Selecciona una sesión computable con marca registrada.";
      if (!code) issues.code = "Selecciona una marca P, F, T o J.";
      if (observation.trim().length > 250)
        issues.observation = "La observación admite hasta 250 caracteres.";
    }
    return issues;
  };
  return (
    <ActActionDialog
      title={
        kind === "grade"
          ? "Corregir nota del acta"
          : "Corregir asistencia del acta"
      }
      correction
      context={
        <Facts
          items={[
            ["Estudiante", item.estudiante],
            ["Matrícula", item.codigo_matricula],
            ["Intento", item.numero_intento],
            ["Acta", "Cerrada"],
          ]}
        />
      }
      captureDirty={
        kind === "grade"
          ? note !== (grade?.nota.replace(".", ",") ?? "")
          : code !== (session?.asistencia?.codigo ?? "") ||
            observation !== (session?.asistencia?.observacion ?? "")
      }
      validate={validate}
      reviewContent={
        <Facts
          items={
            kind === "grade"
              ? [
                  ["Evaluación", grade?.evaluacion],
                  ["Indicador", grade?.indicador],
                  ["Nota anterior", displayedGrade(grade?.nota ?? null)],
                  ["Nota nueva", note],
                ]
              : [
                  [
                    "Fecha de clase",
                    session ? sessionDate(session.fecha) : "Pendiente",
                  ],
                  ["Marca anterior", session?.asistencia?.codigo],
                  ["Marca nueva", code],
                  [
                    "Observación anterior",
                    session?.asistencia?.observacion || "Sin observación",
                  ],
                  [
                    "Observación nueva",
                    observation.trim() || "Sin observación",
                  ],
                ]
          }
        />
      }
      consequence="La corrección actualizará el resultado del intento. Se conservarán los valores anterior y nuevo, tu usuario, la fecha y el motivo. El acta y su cierre original permanecerán cerrados."
      onClose={onClose}
      onConflict={onConflict}
      onReload={onReload}
      onConfirm={async (reason) => {
        const common = {
          cierreId: data.cierre!.id,
          matriculaId: item.matricula_id,
          resultadoVersion: item.resultado!.version,
          motivo: reason,
        };
        const saved = await api<{ cambio: boolean }>(
          `${endpoint}/correccion-${kind === "grade" ? "nota" : "asistencia"}`,
          {
            method: "PATCH",
            body:
              kind === "grade"
                ? {
                    ...common,
                    calificacionId: grade!.id,
                    version: grade!.version,
                    nota: gradeCaptureValue(note),
                  }
                : {
                    ...common,
                    sesionId: session!.id,
                    version: session!.asistencia!.version,
                    codigo: code,
                    observacion: observation.trim() || null,
                  },
          },
        );
        await onSaved(saved.cambio);
      }}
    >
      {({ busy, blocked, issues, clearIssue }) => (
        <>
          <SelectField
            label={
              kind === "grade" ? "Calificación a corregir" : "Sesión a corregir"
            }
            value={selectedId}
            disabled={busy || blocked}
            required
            error={issues.selection}
            onChange={(event) => {
              choose(event.target.value);
              clearIssue("selection");
              clearIssue("note");
              clearIssue("code");
              clearIssue("observation");
            }}
          >
            <option value="">Selecciona un registro</option>
            {kind === "grade"
              ? data.calificaciones.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.evaluacion} · {entry.indicador} ·{" "}
                    {displayedGrade(entry.nota)}
                  </option>
                ))
              : data.sesiones
                  .filter((entry) => entry.computable && entry.asistencia)
                  .map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {sessionDate(entry.fecha)} · {entry.asistencia!.codigo}
                    </option>
                  ))}
          </SelectField>
          {kind === "grade" ? (
            <>
              <p>Nota actual: {displayedGrade(grade?.nota ?? null)}</p>
              <InputField
                label="Nueva nota"
                value={note}
                inputMode="decimal"
                autoComplete="off"
                required
                error={issues.note}
                disabled={busy || blocked}
                hint="0 a 20 · coma o punto · hasta dos decimales"
                onChange={(event) => {
                  setNote(event.target.value);
                  clearIssue("note");
                }}
              />
            </>
          ) : (
            <>
              <p>Marca actual: {session?.asistencia?.codigo ?? "Pendiente"}</p>
              <SelectField
                label="Nueva marca"
                value={code}
                required
                disabled={busy || blocked || !!session?.justificacionId}
                error={issues.code}
                hint={
                  session?.justificacionId
                    ? "La marca J conserva su expediente. Solo puedes corregir la observación sin sustituir la marca ni sus decisiones."
                    : undefined
                }
                onChange={(event) => {
                  setCode(event.target.value as AttendanceCode | "");
                  clearIssue("code");
                }}
              >
                <option value="">Selecciona una marca</option>
                {Object.entries(attendanceCodes).map(([value, label]) => (
                  <option key={value} value={value}>
                    {value} · {label}
                  </option>
                ))}
              </SelectField>
              <TextAreaField
                label="Observación"
                value={observation}
                maxLength={250}
                rows={2}
                disabled={busy || blocked}
                error={issues.observation}
                hint="Opcional · máximo 250 caracteres."
                onChange={(event) => {
                  setObservation(event.target.value);
                  clearIssue("observation");
                }}
              />
            </>
          )}
        </>
      )}
    </ActActionDialog>
  );
}
