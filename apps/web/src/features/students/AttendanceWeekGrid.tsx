import { useMemo } from "react";
import { sessionDate } from "../attendance/model";
import {
  buildWeekGrid,
  dayNames,
  type SessionMark,
} from "./attendance-grid";

const shortDate = (value: string) => sessionDate(value).slice(0, 5);
const markNames: Record<string, string> = {
  P: "Presente",
  F: "Falta",
  T: "Tardanza",
  J: "Falta justificada",
};

/**
 * Hoja de asistencia por semanas, como una planilla: una fila por semana desde
 * la primera hasta la última sesión del intento y una columna por día de clase.
 * Solo muestra marcas guardadas; el cálculo oficial viene de la API.
 */
export function AttendanceWeekGrid({ marks }: { marks: SessionMark[] }) {
  const grid = useMemo(() => buildWeekGrid(marks), [marks]);
  if (!grid.semanas.length)
    return <p className="muted">Sin sesiones registradas.</p>;
  return (
    <div className="week-grid-wrap" tabIndex={0} role="region" aria-label="Asistencia por semanas">
      <table className="week-grid">
        <caption>
          Asistencia por semanas · del {sessionDate(grid.desde!)} al{" "}
          {sessionDate(grid.hasta!)}
        </caption>
        <thead>
          <tr>
            <th scope="col">Semana</th>
            {grid.diasVisibles.map((day) => (
              <th scope="col" key={day}>
                {dayNames[day]}
              </th>
            ))}
            <th scope="col" title="Presentes">P</th>
            <th scope="col" title="Faltas">F</th>
            <th scope="col" title="Tardanzas">T</th>
            <th scope="col" title="Justificadas">J</th>
          </tr>
        </thead>
        <tbody>
          {grid.semanas.map((week) => (
            <tr key={week.lunes}>
              <th scope="row">
                {week.numero}
                <small>desde {shortDate(week.lunes)}</small>
              </th>
              {grid.diasVisibles.map((day) => {
                const cell = week.dias[day];
                if (!cell)
                  return <td key={day} className="mark none" aria-label="Sin clase" />;
                const cancelled = cell.estado === "CANCELADA";
                const code = cancelled ? "" : (cell.codigo ?? "");
                const label = cancelled
                  ? "Sesión cancelada"
                  : (markNames[code] ??
                    (cell.estado === "PROGRAMADA"
                      ? "Sesión programada"
                      : "Sin marca"));
                return (
                  <td
                    key={day}
                    className={`mark ${cancelled ? "cancelled" : code ? `m-${code}` : "pending"}`}
                    title={`${sessionDate(cell.fecha)} · ${label}`}
                    aria-label={`${sessionDate(cell.fecha)}: ${label}`}
                  >
                    {cancelled ? "C" : code || "·"}
                  </td>
                );
              })}
              <td>{week.totales.P || ""}</td>
              <td>{week.totales.F || ""}</td>
              <td>{week.totales.T || ""}</td>
              <td>{week.totales.J || ""}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={grid.diasVisibles.length + 1}>
              Total del intento
            </th>
            <td>{grid.totales.P}</td>
            <td>{grid.totales.F}</td>
            <td>{grid.totales.T}</td>
            <td>{grid.totales.J}</td>
          </tr>
        </tfoot>
      </table>
      <p className="help">
        P presente · F falta · T tardanza · J justificada · C sesión cancelada ·
        · sin marca. Las marcas son las originales: el cálculo de inasistencia
        se muestra en el resumen.
      </p>
    </div>
  );
}
