export type SessionSchedule = {
  fechas: string[];
  horaInicio?: string;
  horaFin?: string;
};

/** Fechas de clase sin zona horaria; extremos del periodo inclusivos. */
export function validateSessionSchedule(
  schedule: SessionSchedule,
  period: { fecha_inicio: string; fecha_fin: string },
): void {
  for (const date of schedule.fechas) {
    const parsed = new Date(`${date}T00:00:00.000Z`);
    if (
      !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date
    )
      throw new Error('Fecha de clase inválida');
    if (date < period.fecha_inicio || date > period.fecha_fin)
      throw new Error(
        'La fecha de clase debe estar dentro del periodo académico',
      );
  }
  const { horaInicio, horaFin } = schedule;
  if ((horaInicio === undefined) !== (horaFin === undefined))
    throw new Error('Indique ambas horas o deje el horario vacío');
  if (horaInicio !== undefined && horaFin !== undefined) {
    const time = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!time.test(horaInicio) || !time.test(horaFin) || horaInicio >= horaFin)
      throw new Error('La hora de inicio debe ser anterior a la hora de fin');
  }
}
