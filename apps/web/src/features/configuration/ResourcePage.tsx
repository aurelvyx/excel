import { ListPanel } from "../../shared/ui/ListPanel";
import { PageHeading } from "../../shared/ui/PageHeading";
import { StatusBadge } from "../../shared/ui/StatusBadge";
import { InputField, SelectField } from "../../shared/ui/Field";
import { Feedback } from "../../shared/ui/Feedback";
import { DataTable } from "../../shared/ui/DataTable";
import { Pagination } from "../../shared/ui/Pagination";
import { Button } from "../../shared/ui/Button";
import { useEffect, useState } from "react";
import {
  allRows,
  api,
  errorText,
  text,
  type Page,
  type Row,
} from "../../shared/api";
import { useAuth } from "../auth/session";
import { navigate } from "../../shared/navigation";
import { Dialog } from "../../shared/Dialog";
import { RecordForm } from "./RecordForm";
import { Assignments } from "./assignments";
import {
  fieldValue,
  labels,
  optionLabel,
  resources,
  rolesResource,
  roleNames,
  type Resource,
} from "./model";

export function ResourcePage({
  resource,
  query,
  path,
}: {
  resource: Resource;
  query: URLSearchParams;
  path: string;
}) {
  const { session } = useAuth();
  const admin = session.user.roles.includes("ADMIN");
  const teacherOnly = session.user.roles.every((role) => role === "DOCENTE");
  const [data, setData] = useState<Page>({ items: [], nextCursor: null });
  const [lookups, setLookups] = useState<Record<string, Row[]>>({});
  const [completed, finish] = useState("");
  const [error, fail] = useState("");
  const [success, notify] = useState("");
  const [version, reload] = useState(0);
  const [editing, setEditing] = useState<Row | null | undefined>(undefined);
  const [roleUser, setRoleUser] = useState<Row | null>(null);
  const [assigned, setAssigned] = useState<Row | null>(null);
  const [detail, setDetail] = useState<Row | null>(null);
  const [opening, setOpening] = useState(false);
  const serialized = query.toString();
  const requestKey = `${resource.key}:${serialized}:${version}:${admin}:${teacherOnly}`;
  const loading = completed !== requestKey;
  useEffect(() => {
    const abort = new AbortController();
    const references = new Set(
      [...resource.fields, ...(resource.filters ?? [])]
        .map((field) => field.reference)
        .filter((key): key is string => !!key),
    );
    if (references.has("niveles")) references.add("idiomas");
    if (resource.key === "grupos" && admin) references.add("docentes");
    if (teacherOnly) references.clear();
    const lookupRequests = [...references].map(async (key) => {
      const rows = await allRows(
        key === "personas-docentes" ? "docentes" : resources[key].path,
        abort.signal,
      );
      return [
        key,
        key === "personas-docentes"
          ? rows.map((row) => ({ ...row, id: String(row.persona_id) }))
          : rows,
      ] as const;
    });
    void Promise.all([
      api<Page>(`${resource.path}?limit=20&${serialized}`, {
        signal: abort.signal,
      }),
      Promise.all(lookupRequests),
    ])
      .then(([page, options]) => {
        if (!abort.signal.aborted) {
          fail("");
          setData(page);
          setLookups(Object.fromEntries(options));
        }
      })
      .catch((e) => {
        if (!abort.signal.aborted) fail(errorText(e));
      })
      .finally(() => {
        if (!abort.signal.aborted) finish(requestKey);
      });
    return () => abort.abort();
  }, [resource, serialized, version, admin, teacherOnly, requestKey]);
  function filter(key: string, value: string) {
    const next = new URLSearchParams(serialized);
    next.delete("after");
    if (value) next.set(key, value);
    else next.delete(key);
    navigate(`${path}?${next}`);
  }
  async function open(row: Row) {
    setOpening(true);
    fail("");
    try {
      setEditing(
        resource.key === "usuarios"
          ? row
          : await api<Row>(`${resource.path}/${row.id}`),
      );
    } catch (e) {
      fail(errorText(e));
    } finally {
      setOpening(false);
    }
  }
  const saved = () => {
    setEditing(undefined);
    setRoleUser(null);
    notify("Cambios guardados.");
    reload((value) => value + 1);
  };
  function cell(row: Row, key: string) {
    if (key === "roles")
      return (row.roles as string[]).map((role) => roleNames[role]).join(", ");
    const field = resource.fields.find((field) => field.key === key);
    const value = field ? fieldValue(field, row) : text(row, key);
    if (field?.reference) {
      const option = lookups[field.reference]?.find(
        (item) => String(item.id) === value,
      );
      if (option) return optionLabel(option, field.reference, lookups);
      const context = (row.contexto ?? {}) as Record<string, unknown>;
      return text(context, key.replace("Id", "")) || `#${value}`;
    }
    return labels[value] ?? (value || "—");
  }
  return (
    <section>
      <PageHeading
        eyebrow={
          admin
            ? "Configuración"
            : teacherOnly
              ? "Mi espacio"
              : "Consulta académica"
        }
        title={teacherOnly ? "Mis grupos" : resource.title}
        description={
          teacherOnly
            ? "Consulta los grupos que tienes asignados."
            : resource.description
        }
        action={
          admin && (
            <Button
              variant="primary"
              disabled={loading || opening || !!error}
              onClick={() => {
                notify("");
                setEditing(null);
              }}
            >
              Crear {resource.singular}
            </Button>
          )
        }
      />
      {!admin && (
        <p className="readonly">
          Solo lectura ·{" "}
          {teacherOnly
            ? "Grupos asignados a tu cuenta"
            : "Consulta autorizada para tu rol"}
        </p>
      )}
      <Feedback tone="success">{success}</Feedback>
      <ListPanel
        filters={
          !teacherOnly &&
          !!resource.filters?.length && (
            <form
              className="filters"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                const next = new URLSearchParams();
                for (const [key, value] of data)
                  if (value) next.set(key, String(value));
                navigate(`${path}?${next}`);
              }}
            >
              {resource.filters.map((field) =>
                field.reference || field.options ? (
                  <SelectField
                    key={field.key}
                    label={field.label}
                    id={`filter-${field.key}`}
                    name={field.key}
                    value={query.get(field.key) ?? ""}
                    onChange={(event) => filter(field.key, event.target.value)}
                    disabled={loading}
                  >
                    <option value="">Todos</option>
                    {field.reference
                      ? (lookups[field.reference] ?? []).map((row) => (
                          <option key={row.id} value={row.id}>
                            {optionLabel(row, field.reference!, lookups)}
                          </option>
                        ))
                      : field.options?.map((value) => (
                          <option key={value} value={value}>
                            {labels[value] ?? value}
                          </option>
                        ))}
                  </SelectField>
                ) : (
                  <InputField
                    label={field.label}
                    key={`${field.key}:${serialized}`}
                    id={`filter-${field.key}`}
                    name={field.key}
                    defaultValue={query.get(field.key) ?? ""}
                    maxLength={field.max}
                  />
                ),
              )}
              {resource.filters.some(
                (field) => !field.reference && !field.options,
              ) && (
                <Button type="submit" disabled={loading}>
                  Buscar
                </Button>
              )}
              <Button
                type="button"
                onClick={() => navigate(path)}
                disabled={loading || !serialized}
              >
                Limpiar filtros
              </Button>
            </form>
          )
        }
        loading={loading}
        loadingLabel={`Cargando ${resource.title.toLowerCase()}…`}
        error={error}
        onRetry={() => reload((value) => value + 1)}
        empty={!data.items.length}
        emptyDescription={
          serialized
            ? "Prueba con otros filtros."
            : admin
              ? `Crea el primer registro de ${resource.title.toLowerCase()} para comenzar.`
              : "Todavía no hay registros disponibles para tu cuenta."
        }
        pagination={
          <Pagination
            count={data.items.length}
            after={query.get("after")}
            nextCursor={data.nextCursor}
            onChange={(cursor) => filter("after", cursor)}
          />
        }
      >
        <DataTable
          caption={resource.title}
          rows={data.items}
          rowKey={(row) => row.id}
          columns={[
            ...resource.columns.map((key) => ({
              key,
              header:
                resource.fields.find((field) => field.key === key)?.label ??
                (
                  {
                    nombres: "Nombres",
                    apellido_paterno: "Apellido paterno",
                    roles: "Roles",
                  } as Record<string, string>
                )[key] ??
                key,
              cell: (row: Row) =>
                key === "activo" || key === "estado" ? (
                  <StatusBadge
                    inactive={row.activo === false || row.estado === "CERRADO"}
                  >
                    {cell(row, key)}
                  </StatusBadge>
                ) : (
                  cell(row, key)
                ),
            })),
            {
              key: "actions",
              header: "Acciones",
              className: "row-actions",
              cell: (row) => (
                <>
                  {resource.key === "grupos" && (
                    <a href={`#/asistencia/grupos/${row.id}`}>Sesiones</a>
                  )}
                  {admin ? (
                    <>
                      <Button
                        variant="link"
                        disabled={opening}
                        onClick={() => void open(row)}
                      >
                        Editar
                      </Button>
                      {resource.key === "usuarios" && (
                        <Button variant="link" onClick={() => setRoleUser(row)}>
                          Roles
                        </Button>
                      )}
                      {resource.key === "grupos" && (
                        <Button variant="link" onClick={() => setAssigned(row)}>
                          Asignar docentes
                        </Button>
                      )}
                    </>
                  ) : (
                    <Button variant="link" onClick={() => setDetail(row)}>
                      Ver detalle
                    </Button>
                  )}
                </>
              ),
            },
          ]}
        />
      </ListPanel>
      {editing !== undefined && (
        <RecordForm
          resource={resource}
          row={editing ?? undefined}
          lookups={lookups}
          onClose={() => setEditing(undefined)}
          onSave={async (body) => {
            await api(resource.path + (editing ? `/${editing.id}` : ""), {
              method: editing ? "PATCH" : "POST",
              body,
            });
            saved();
          }}
        />
      )}
      {roleUser && (
        <RecordForm
          resource={rolesResource}
          row={roleUser}
          lookups={{}}
          onClose={() => setRoleUser(null)}
          onSave={async (body) => {
            await api(`usuarios/${roleUser.id}/roles`, { method: "PUT", body });
            saved();
          }}
        />
      )}
      {assigned && (
        <Assignments
          group={assigned}
          teachers={lookups.docentes ?? []}
          onClose={() => setAssigned(null)}
        />
      )}
      {detail && (
        <Dialog
          title={text(detail, "codigo") || resource.title}
          onClose={() => setDetail(null)}
        >
          <p className="readonly">Solo lectura</p>
          <dl className="detail">
            {resource.fields.map((field) => (
              <div key={field.key}>
                <dt>{field.label}</dt>
                <dd>{cell(detail, field.key)}</dd>
              </div>
            ))}
          </dl>
        </Dialog>
      )}
    </section>
  );
}
