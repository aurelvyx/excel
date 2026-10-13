import { labels } from "../configuration/model";
import { Facts } from "../../shared/ui/Facts";
import { academicTime, sessionDate, type SessionGroup } from "./model";

export function GroupContext({ group }: { group: SessionGroup }) {
  return (
    <section
      className="panel enrollment-context"
      aria-label="Contexto del grupo"
    >
      <Facts
        emptyLabel="—"
        items={[
          ["Grupo", group.codigo],
          ["Estado del grupo", labels[group.estado] ?? group.estado],
          [
            "Estado de asistencia",
            group.asistencia_cerrada ? "Cerrada" : "Abierta",
          ],
          ...(group.cierre_asistencia
            ? ([
                ["Cerrada por", group.cierre_asistencia.realizado_nombre],
                [
                  "Fecha del cierre",
                  academicTime(group.cierre_asistencia.realizado_at),
                ],
              ] as const)
            : []),
          ["Periodo", group.contexto.periodo],
          [
            "Estado del periodo",
            labels[group.periodo_estado] ?? group.periodo_estado,
          ],
          ["Idioma", group.contexto.idioma],
          ["Nivel", group.contexto.nivel],
          ["Turno", group.contexto.turno],
          ["Sección", group.contexto.seccion],
          [
            "Fechas del periodo",
            `${sessionDate(group.fecha_inicio)} al ${sessionDate(group.fecha_fin)}`,
          ],
        ]}
      />
    </section>
  );
}
