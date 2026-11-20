import { useState } from "react";
import { Button } from "../../shared/ui/Button";
import { StatusBadge } from "../../shared/ui/StatusBadge";
import { WorkspaceSummary } from "../academic/components/WorkspaceSummary";
import {
  currentClassDate,
  sessionDate,
  sessionTime,
  sessionStates,
  type ClassSession,
  type SessionGroup,
} from "./model";

const monthNames = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];
const weekdays = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/** Calendario de Front/1 sobre todas las páginas de sesiones autorizadas. */
export function SessionCalendar({
  items,
  group,
  cards,
  canCreate,
  onCreate,
  sessionHref,
}: {
  items: ClassSession[];
  group: SessionGroup;
  cards: boolean;
  canCreate: boolean;
  onCreate: (date: string) => void;
  sessionHref: (id: string) => string;
}) {
  const today = currentClassDate();
  const available = [
    ...new Set(items.map((item) => item.fecha.slice(0, 7))),
  ].sort();
  const initial = available.includes(today.slice(0, 7))
    ? today.slice(0, 7)
    : (available[0] ?? group.fecha_inicio.slice(0, 7));
  const [selected, select] = useState(initial);
  const [year, month] = selected.split("-").map(Number) as [number, number];
  const sessions = items.filter((item) => item.fecha.startsWith(selected));
  const byDate = new Map(items.map((item) => [item.fecha.slice(0, 10), item]));
  const first = new Date(Date.UTC(year, month - 1, 1));
  const start = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const total = Math.ceil((start + days) / 7) * 7;
  function move(offset: number) {
    const date = new Date(Date.UTC(year, month - 1 + offset, 1));
    select(date.toISOString().slice(0, 7));
  }
  return (
    <>
      <div className="workspace-calendar-toolbar">
        <div>
          <Button onClick={() => move(-1)} aria-label="Mes anterior">
            ‹
          </Button>
          <strong>
            {monthNames[month - 1]} {year}
          </strong>
          <Button onClick={() => move(1)} aria-label="Mes siguiente">
            ›
          </Button>
          <Button onClick={() => select(today.slice(0, 7))}>Hoy</Button>
        </div>
        <div>
          {available.map((value) => (
            <Button
              key={value}
              onClick={() => select(value)}
              aria-pressed={selected === value}
            >
              {monthNames[Number(value.slice(5)) - 1]} {value.slice(0, 4)}
            </Button>
          ))}
        </div>
      </div>
      <WorkspaceSummary
        label="Sesiones del mes"
        items={[
          {
            label: "Total del mes",
            value: sessions.length,
            detail: "Todas las páginas consultadas",
          },
          {
            label: "Realizadas",
            value: sessions.filter((item) => item.estado === "REALIZADA")
              .length,
            tone: "green",
          },
          {
            label: "Programadas",
            value: sessions.filter((item) => item.estado === "PROGRAMADA")
              .length,
            tone: "blue",
          },
          {
            label: "Canceladas",
            value: sessions.filter((item) => item.estado === "CANCELADA")
              .length,
            tone: "amber",
          },
        ]}
      />
      {cards ? (
        <div className="workspace-session-cards">
          {!sessions.length && (
            <p className="muted">No hay sesiones en este mes.</p>
          )}
          {sessions.map((item) => (
            <article className="workspace-session-card" key={item.id}>
              <h3>{sessionDate(item.fecha)}</h3>
              <p>{sessionTime(item.hora_inicio, item.hora_fin)}</p>
              <StatusBadge inactive={item.estado === "CANCELADA"}>
                {sessionStates[item.estado]}
              </StatusBadge>
              <a href={sessionHref(item.id)}>
                Abrir asistencia del {sessionDate(item.fecha)}
              </a>
            </article>
          ))}
        </div>
      ) : (
        <div
          className="workspace-calendar"
          aria-label={`Calendario de ${monthNames[month - 1]} ${year}`}
        >
          {weekdays.map((day) => (
            <div key={day} className="workspace-calendar-weekday">
              {day}
            </div>
          ))}
          {Array.from({ length: total }, (_, index) => {
            const date = new Date(Date.UTC(year, month - 1, index - start + 1))
              .toISOString()
              .slice(0, 10);
            const inMonth = date.startsWith(selected);
            const item = byDate.get(date);
            return (
              <div
                key={date}
                className={`workspace-calendar-day ${inMonth ? "" : "is-outside"} ${date === today ? "is-today" : ""}`}
              >
                <span className="workspace-calendar-date">
                  {Number(date.slice(-2))}
                </span>
                {item && (
                  <a
                    className={`workspace-calendar-session is-${item.estado.toLowerCase()}`}
                    href={sessionHref(item.id)}
                    aria-label={`Abrir asistencia del ${sessionDate(date)}`}
                  >
                    {sessionStates[item.estado]}
                    <small>
                      {sessionTime(item.hora_inicio, item.hora_fin)}
                    </small>
                  </a>
                )}
                {!item &&
                  inMonth &&
                  canCreate &&
                  date >= group.fecha_inicio &&
                  date <= group.fecha_fin && (
                    <button
                      type="button"
                      className="workspace-calendar-add"
                      onClick={() => onCreate(date)}
                      aria-label={`Programar sesión del ${sessionDate(date)}`}
                    >
                      + Programar
                    </button>
                  )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
