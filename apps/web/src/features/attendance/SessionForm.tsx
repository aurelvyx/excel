import { useRef, useState, type FormEvent } from "react";
import { Calendar, Clock, Plus, Trash2, CheckCircle2 } from "lucide-react";
import { api, errorText } from "../../shared/api";
import { Dialog } from "../../shared/Dialog";
import { Button } from "../../shared/ui/Button";
import { Feedback } from "../../shared/ui/Feedback";
import { InputField } from "../../shared/ui/Field";
import {
  sessionDate,
  type ClassSession,
  type SessionGroup,
} from "./model";
import "../academic/academic.css";

export function SessionForm({
  group,
  endpoint,
  initialDate,
  existingDates = [],
  onClose,
  onSaved,
  onTakeAttendanceNow,
}: {
  group: SessionGroup;
  endpoint: string;
  initialDate?: string;
  existingDates?: string[];
  onClose: () => void;
  onSaved: (count: number, created?: ClassSession[]) => void;
  onTakeAttendanceNow?: (session: ClassSession) => void;
}) {
  const [date, setDate] = useState(initialDate ?? "");
  const [dates, setDates] = useState<string[]>(
    initialDate && !existingDates.includes(initialDate) ? [initialDate] : [],
  );
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [error, fail] = useState("");
  const [busy, pending] = useState(false);
  const submitting = useRef(false);
  const form = useRef<HTMLFormElement>(null);

  function invalidDate(value: string, currentList: string[]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
      return "Selecciona una fecha de clase válida.";
    if (value < group.fecha_inicio || value > group.fecha_fin)
      return `La fecha debe estar dentro del periodo académico (${sessionDate(group.fecha_inicio)} al ${sessionDate(group.fecha_fin)}).`;
    if (existingDates.includes(value))
      return "Este día ya tiene una sesión registrada en el salón.";
    if (currentList.includes(value))
      return "Esta fecha ya está incluida en la lista.";
    if (currentList.length >= 100)
      return "Puedes programar hasta 100 fechas por lote.";
    return "";
  }

  function addDate() {
    if (!date) {
      setIssues({ date: "Selecciona una fecha para añadirla." });
      return;
    }
    const issue = invalidDate(date, dates);
    if (issue) {
      setIssues({ date: issue });
      return;
    }
    setDates((values) => [...values, date].sort());
    setDate("");
    setIssues({});
    fail("");
  }

  function resolveDatesList(): string[] | null {
    const nextIssues: Record<string, string> = {};
    const combined = [...dates];

    // Si hay una fecha seleccionada en el input que aún no fue agregada con el botón "+", la incluimos automáticamente
    if (date.trim()) {
      if (!combined.includes(date.trim())) {
        const issue = invalidDate(date.trim(), combined);
        if (issue) {
          nextIssues.date = issue;
        } else {
          combined.push(date.trim());
          combined.sort();
        }
      }
    }

    if (!combined.length && !nextIssues.date) {
      nextIssues.date = "Selecciona al menos una fecha de clase.";
    }

    if (Boolean(start) !== Boolean(end)) {
      nextIssues[start ? "end" : "start"] =
        "Completa ambas horas o deja las dos vacías.";
    } else if (start && end && start >= end) {
      nextIssues.end = "La hora de fin debe ser posterior a la hora de inicio.";
    }

    setIssues(nextIssues);
    if (Object.keys(nextIssues).length > 0) return null;
    return combined;
  }

  async function saveSessions(openImmediately: boolean) {
    if (submitting.current) return;
    const finalDates = resolveDatesList();
    if (!finalDates) return;

    submitting.current = true;
    pending(true);
    fail("");
    try {
      const result = await api<{ items: ClassSession[] }>(endpoint, {
        method: "POST",
        body: {
          fechas: finalDates,
          ...(start && end ? { horaInicio: start, horaFin: end } : {}),
        },
      });
      if (openImmediately && result.items.length > 0 && onTakeAttendanceNow) {
        onTakeAttendanceNow(result.items[0]);
      } else {
        onSaved(result.items.length, result.items);
      }
    } catch (e) {
      fail(errorText(e));
    } finally {
      submitting.current = false;
      pending(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void saveSessions(false);
  }

  return (
    <Dialog
      title={
        initialDate
          ? `Nueva Asistencia · ${sessionDate(initialDate)}`
          : "Crear / Programar Sesiones de Asistencia"
      }
      onClose={onClose}
      busy={busy}
    >
      <form ref={form} onSubmit={submit} noValidate>
        <div
          style={{
            padding: "0.75rem 1rem",
            backgroundColor: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: "0.5rem",
            fontSize: "0.8125rem",
            color: "#166534",
            marginBottom: "1rem",
          }}
        >
          <div>
            <strong>Salón {group.codigo}</strong> · {group.contexto.idioma} — {group.contexto.nivel} ({group.contexto.turno})
          </div>
          <div style={{ fontSize: "0.75rem", marginTop: "0.2rem", color: "#15803d" }}>
            📅 Rango del periodo ({group.contexto.periodo}):{" "}
            <strong>{sessionDate(group.fecha_inicio)}</strong> al{" "}
            <strong>{sessionDate(group.fecha_fin)}</strong>
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", marginBottom: "0.75rem" }}>
          <div style={{ flex: 1 }}>
            <InputField
              label="Seleccionar Fecha de Clase"
              id="session-date"
              type="date"
              name="fecha"
              value={date}
              min={group.fecha_inicio}
              max={group.fecha_fin}
              error={issues.date}
              autoFocus={!initialDate}
              disabled={busy}
              onChange={(event) => {
                const val = event.target.value;
                setDate(val);
                setIssues((old) => ({ ...old, date: "" }));
                // Si se abrió con una sola fecha y el usuario cambia el input, sincronizamos
                if (dates.length <= 1 && val && !existingDates.includes(val)) {
                  if (val >= group.fecha_inicio && val <= group.fecha_fin) {
                    setDates([val]);
                  }
                }
              }}
            />
          </div>

          <button
            type="button"
            disabled={busy || !date || dates.length >= 100}
            onClick={addDate}
            className="academic-btn-action btn-action-secondary"
            style={{ height: "2.4rem", marginBottom: issues.date ? "1.5rem" : "0.25rem" }}
            title="Añadir otra fecha para programar varias sesiones en lote"
          >
            <Plus size={14} /> Añadir otra fecha
          </button>
        </div>

        {/* Lista de fechas seleccionadas */}
        {dates.length > 0 && (
          <div
            style={{
              backgroundColor: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "0.5rem",
              padding: "0.65rem 0.85rem",
              marginBottom: "1rem",
            }}
          >
            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#475569", marginBottom: "0.4rem", display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <Calendar size={13} color="#007a3d" />
              <span>
                {dates.length === 1
                  ? "1 fecha lista para crear sesión:"
                  : `${dates.length} fechas listas para crear:`}
              </span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
              {dates.map((value) => (
                <span
                  key={value}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    backgroundColor: "#ffffff",
                    border: "1px solid #cbd5e1",
                    borderRadius: "999px",
                    padding: "0.2rem 0.6rem",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: "#1e293b",
                  }}
                >
                  {sessionDate(value)}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setDates((old) => old.filter((item) => item !== value));
                      if (date === value) setDate("");
                      setIssues({});
                      fail("");
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                      display: "inline-flex",
                      color: "#ef4444",
                    }}
                    title="Quitar fecha"
                  >
                    <Trash2 size={12} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="form-grid" style={{ marginBottom: "0.75rem" }}>
          <InputField
            label="Hora de inicio (opcional)"
            type="time"
            name="horaInicio"
            value={start}
            error={issues.start}
            disabled={busy}
            onChange={(event) => {
              setStart(event.target.value);
              setIssues((old) => ({ ...old, start: "", end: "" }));
            }}
          />
          <InputField
            label="Hora de fin (opcional)"
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

        <p style={{ fontSize: "0.75rem", color: "#64748b", margin: "0 0 0.75rem", display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <Clock size={13} /> Si dejas las horas vacías, la sesión se creará como jornada general del turno {group.contexto.turno}.
        </p>

        <Feedback>{error}</Feedback>

        <footer className="actions" style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", flexWrap: "wrap", marginTop: "1rem" }}>
          <Button disabled={busy} onClick={onClose}>
            Cancelar
          </Button>

          <Button
            type="submit"
            disabled={busy}
            busy={busy}
            busyLabel="Guardando…"
          >
            {dates.length > 1 ? `Programar ${dates.length} Sesiones` : "Solo Programar Sesión"}
          </Button>

          {onTakeAttendanceNow && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveSessions(true)}
              className="academic-btn-action btn-action-primary"
              style={{ padding: "0.5rem 1rem" }}
            >
              <CheckCircle2 size={15} /> Crear y Tomar Asistencia Ahora
            </button>
          )}
        </footer>
      </form>
    </Dialog>
  );
}
