import { Feedback, Loading } from "../../shared/ui/Feedback";
import { DataTable } from "../../shared/ui/DataTable";
import { useApiQuery } from "../../shared/useApiQuery";
import { Button } from "../../shared/ui/Button";
import { useState } from "react";
import { api, text, type Row } from "../../shared/api";
import { Dialog } from "../../shared/Dialog";
import { RecordForm } from "./RecordForm";
import { optionLabel, type Field, type Resource } from "./model";
const fields: Field[] = [
  {
    key: "docenteId",
    source: "docente_id",
    label: "Docente",
    reference: "docentes",
    required: true,
    immutable: true,
  },
  {
    key: "esTitular",
    source: "es_titular",
    label: "Tipo de asignación",
    type: "select",
    options: ["true", "false"],
    required: true,
  },
  {
    key: "fechaAsignacion",
    source: "fecha_asignacion",
    label: "Fecha de asignación",
    type: "date",
    required: true,
  },
  {
    key: "activo",
    label: "Estado",
    type: "select",
    options: ["true", "false"],
    required: true,
  },
];
export function Assignments({
  group,
  teachers,
  onClose,
}: {
  group: Row;
  teachers: Row[];
  onClose: () => void;
}) {
  const [editing, edit] = useState<Row | null | undefined>(undefined);
  const [notice, notify] = useState("");
  const path = `oferta/grupos/${group.id}/docentes`;
  const { data: rows = [], error, loading, reload } = useApiQuery<Row[]>(path);
  const resource: Resource = {
    key: "asignacion",
    title: "Asignaciones",
    singular: "asignación docente",
    path,
    description: `Grupo ${text(group, "codigo")}. Las asignaciones anteriores se conservan al inactivarlas.`,
    fields,
    columns: [],
  };
  if (editing !== undefined)
    return (
      <RecordForm
        resource={resource}
        row={editing ?? undefined}
        lookups={{ docentes: teachers }}
        onClose={() => edit(undefined)}
        onSave={async (body) => {
          const id = editing
            ? text(editing, "docente_id")
            : String(body.docenteId);
          delete body.docenteId;
          const original: Record<string, unknown> = editing ?? {};
          const payload = {
            esTitular: original.es_titular,
            fechaAsignacion: text(original, "fecha_asignacion").slice(0, 10),
            activo: original.activo,
            ...body,
          };
          await api(`${path}/${id}`, { method: "PUT", body: payload });
          edit(undefined);
          notify("Asignación guardada.");
          reload();
        }}
      />
    );
  return (
    <Dialog title={`Docentes de ${text(group, "codigo")}`} onClose={onClose}>
      <p className="muted">{resource.description}</p>
      <Feedback tone="notice">{notice}</Feedback>
      {!loading && error ? (
        <Feedback onRetry={reload}>{error}</Feedback>
      ) : loading ? (
        <Loading>Cargando asignaciones…</Loading>
      ) : (
        <>
          <Button
            variant="primary"
            disabled={group.estado === "CERRADO"}
            onClick={() => edit(null)}
          >
            Asignar docente
          </Button>
          {!rows.length ? (
            <p className="empty">Todavía no hay docentes asignados.</p>
          ) : (
            <DataTable
              caption="Docentes asignados"
              rows={rows}
              rowKey={(row) => text(row, "docente_id")}
              columns={[
                {
                  key: "docente",
                  header: "Docente",
                  cell: (row) =>
                    optionLabel(
                      teachers.find(
                        (teacher) =>
                          String(teacher.id) === text(row, "docente_id"),
                      ) ?? { id: "", codigo_docente: text(row, "docente_id") },
                      "docentes",
                      {},
                    ),
                },
                {
                  key: "asignacion",
                  header: "Asignación",
                  cell: (row) => (row.es_titular ? "Titular" : "Apoyo"),
                },
                {
                  key: "estado",
                  header: "Estado",
                  cell: (row) => (row.activo ? "Activo" : "Inactivo"),
                },
                {
                  key: "acciones",
                  header: "Acciones",
                  cell: (row) => (
                    <Button
                      onClick={() =>
                        edit({ ...row, id: text(row, "docente_id") })
                      }
                    >
                      Editar asignación
                    </Button>
                  ),
                },
              ]}
            />
          )}
        </>
      )}
    </Dialog>
  );
}
