import { useEffect, useState } from "react";
import { api, errorText, text, type Row } from "../../shared/api";
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
  const [rows, setRows] = useState<Row[]>([]);
  const [error, fail] = useState("");
  const [completed, finish] = useState(-1);
  const [version, reload] = useState(0);
  const loading = completed !== version;
  const [editing, edit] = useState<Row | null | undefined>(undefined);
  const [notice, notify] = useState("");
  const path = `oferta/grupos/${group.id}/docentes`;
  useEffect(() => {
    const abort = new AbortController();
    void api<Row[]>(path, { signal: abort.signal })
      .then((data) => {
        if (!abort.signal.aborted) {
          setRows(data);
          fail("");
        }
      })
      .catch((e) => {
        if (!abort.signal.aborted) fail(errorText(e));
      })
      .finally(() => {
        if (!abort.signal.aborted) finish(version);
      });
    return () => abort.abort();
  }, [path, version]);
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
          reload((value) => value + 1);
        }}
      />
    );
  return (
    <Dialog title={`Docentes de ${text(group, "codigo")}`} onClose={onClose}>
      <p className="muted">{resource.description}</p>
      {notice && (
        <p role="status" className="success">
          {notice}
        </p>
      )}
      {!loading && error ? (
        <p role="alert" className="error">
          {error}{" "}
          <button onClick={() => reload((value) => value + 1)}>
            Reintentar
          </button>
        </p>
      ) : loading ? (
        <p role="status">Cargando asignaciones…</p>
      ) : (
        <>
          <button
            className="primary"
            disabled={group.estado === "CERRADO"}
            onClick={() => edit(null)}
          >
            Asignar docente
          </button>
          {!rows.length ? (
            <p className="empty">Todavía no hay docentes asignados.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Docente</th>
                    <th>Asignación</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={text(row, "docente_id")}>
                      <td>
                        {optionLabel(
                          teachers.find(
                            (teacher) =>
                              String(teacher.id) === text(row, "docente_id"),
                          ) ?? {
                            id: "",
                            codigo_docente: text(row, "docente_id"),
                          },
                          "docentes",
                          {},
                        )}
                      </td>
                      <td>{row.es_titular ? "Titular" : "Apoyo"}</td>
                      <td>{row.activo ? "Activo" : "Inactivo"}</td>
                      <td>
                        <button
                          onClick={() =>
                            edit({ ...row, id: text(row, "docente_id") })
                          }
                        >
                          Editar asignación
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Dialog>
  );
}
