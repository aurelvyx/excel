import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, errorText } from "../../shared/api";
import { Dialog } from "../../shared/Dialog";
import { Button } from "../../shared/ui/Button";
import { Facts } from "../../shared/ui/Facts";
import { Feedback } from "../../shared/ui/Feedback";
import { InputField } from "../../shared/ui/Field";
import {
  sessionDate,
  sessionTime,
  type ClassSession,
  type SessionGroup,
} from "./model";

export function SessionForm({
  group,
  endpoint,
  onClose,
  onSaved,
}: {
  group: SessionGroup;
  endpoint: string;
  onClose: () => void;
  onSaved: (count: number) => void;
}) {
  const [date, setDate] = useState("");
  const [dates, setDates] = useState<string[]>([]);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [error, fail] = useState("");
  const [review, confirm] = useState(false);
  const [busy, pending] = useState(false);
  const submitting = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const reviewTitle = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (review) reviewTitle.current?.focus();
  }, [review]);
  function invalidDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
      return "Selecciona una fecha de clase válida.";
    if (value < group.fecha_inicio || value > group.fecha_fin)
      return "La fecha debe estar dentro del periodo académico.";
    if (dates.includes(value))
      return "Esta fecha ya está incluida en la programación.";
    if (dates.length >= 100)
      return "Puedes programar hasta 100 fechas por lote.";
    return "";
  }
  function focusInvalid() {
    setTimeout(
      () =>
        form.current
          ?.querySelector<HTMLElement>('[aria-invalid="true"]')
          ?.focus(),
      0,
    );
  }
  function addDate() {
    const issue = invalidDate(date);
    if (issue) {
      setIssues({ date: issue });
      focusInvalid();
      return;
    }
    setDates((values) => [...values, date].sort());
    setDate("");
    setIssues({});
    fail("");
  }
  function validate() {
    const next: Record<string, string> = {};
    if (!dates.length) next.date = "Añade al menos una fecha de clase.";
    else if (date)
      next.date =
        "Añade la fecha indicada al lote o borra el campo antes de continuar.";
    if (Boolean(start) !== Boolean(end))
      next[start ? "end" : "start"] =
        "Completa ambas horas o deja las dos vacías.";
    else if (start && end && start >= end)
      next.end = "La hora de fin debe ser posterior a la hora de inicio.";
    setIssues(next);
    if (Object.keys(next).length) focusInvalid();
    return Object.keys(next).length === 0;
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !validate()) return;
    if (!review) {
      fail("");
      confirm(true);
      return;
    }
    submitting.current = true;
    pending(true);
    fail("");
    try {
      const result = await api<{ items: ClassSession[] }>(endpoint, {
        method: "POST",
        body: {
          fechas: dates,
          ...(start && end ? { horaInicio: start, horaFin: end } : {}),
        },
      });
      onSaved(result.items.length);
    } catch (e) {
      fail(errorText(e));
      confirm(false);
    } finally {
      submitting.current = false;
      pending(false);
    }
  }
  return (
    <Dialog title="Programar sesiones" onClose={onClose} busy={busy}>
      <form ref={form} onSubmit={submit} noValidate>
        <p className="muted">
          Grupo {group.codigo} · {group.contexto.periodo} ·{" "}
          {group.contexto.idioma} · {group.contexto.nivel}. Fechas permitidas:{" "}
          {sessionDate(group.fecha_inicio)} al {sessionDate(group.fecha_fin)}.
        </p>
        {review ? (
          <section className="review">
            <h3 ref={reviewTitle} tabIndex={-1}>
              Revisa la programación
            </h3>
            <Facts
              emptyLabel="—"
              items={[
                ["Grupo", group.codigo],
                ["Periodo", group.contexto.periodo],
                [
                  "Idioma y nivel",
                  `${group.contexto.idioma} · ${group.contexto.nivel}`,
                ],
                [
                  "Turno y sección",
                  `${group.contexto.turno} · ${group.contexto.seccion}`,
                ],
                ["Horario para todas las sesiones", sessionTime(start, end)],
                ["Cantidad de sesiones", dates.length],
              ]}
            />
            <ul className="session-dates" aria-label="Fechas por confirmar" tabIndex={0}>
              {dates.map((value) => (
                <li key={value}>{sessionDate(value)}</li>
              ))}
            </ul>
            <p className="notice">
              Al confirmar, se guardarán todas estas fechas como sesiones
              programadas.
            </p>
          </section>
        ) : (
          <>
            <InputField
              label="Fecha de clase"
              id="session-date"
              type="date"
              name="fecha"
              value={date}
              min={group.fecha_inicio}
              max={group.fecha_fin}
              error={issues.date}
              hint="Añade cada fecha de clase al lote. Hasta 100 fechas por programación."
              autoFocus
              disabled={busy}
              onChange={(event) => {
                setDate(event.target.value);
                setIssues((old) => ({ ...old, date: "" }));
              }}
            />
            <Button disabled={busy || dates.length >= 100} onClick={addDate}>
              Añadir fecha
            </Button>
            <p className="help" role="status">
              {dates.length} fechas añadidas
            </p>
            {!!dates.length && (
              <ul className="session-dates" aria-label="Fechas añadidas" tabIndex={0}>
                {dates.map((value) => (
                  <li key={value}>
                    <span>{sessionDate(value)}</span>
                    <Button
                      variant="link"
                      disabled={busy}
                      aria-label={`Quitar fecha ${sessionDate(value)}`}
                      onClick={() => {
                        setDates((old) => old.filter((item) => item !== value));
                        setIssues({});
                        fail("");
                      }}
                    >
                      Quitar
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="form-grid">
              <InputField
                label="Hora de inicio"
                type="time"
                name="horaInicio"
                value={start}
                error={issues.start}
                hint="Opcional. El horario se aplica a todas las fechas del lote."
                disabled={busy}
                onChange={(event) => {
                  setStart(event.target.value);
                  setIssues((old) => ({ ...old, start: "", end: "" }));
                }}
              />
              <InputField
                label="Hora de fin"
                type="time"
                name="horaFin"
                value={end}
                error={issues.end}
                disabled={busy}
                onChange={(event) => {
                  setEnd(event.target.value);
                  setIssues((old) => ({ ...old, start: "", end: "" }));
                }}
              />
            </div>
          </>
        )}
        <Feedback>{error}</Feedback>
        <footer className="actions">
          <Button
            disabled={busy}
            onClick={review ? () => confirm(false) : onClose}
          >
            {review ? "Volver a editar" : "Cancelar"}
          </Button>
          <Button
            type="submit"
            variant="primary"
            busy={busy}
            busyLabel="Guardando sesiones…"
          >
            {review ? "Confirmar programación" : "Revisar programación"}
          </Button>
        </footer>
      </form>
    </Dialog>
  );
}
