import { labels } from "../configuration/model";
import { Facts } from "../../shared/ui/Facts";
import { sessionDate, type SessionGroup } from "./model";

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
