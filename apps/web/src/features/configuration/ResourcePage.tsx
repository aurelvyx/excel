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
      <header className="page-heading">
        <div>
          <p className="eyebrow">
            {admin
              ? "Configuración"
              : teacherOnly
                ? "Mi espacio"
                : "Consulta académica"}
          </p>
          <h1>{teacherOnly ? "Mis grupos" : resource.title}</h1>
          <p className="muted">
            {teacherOnly
              ? "Consulta los grupos que tienes asignados."
              : resource.description}
          </p>
        </div>
        {admin && (
          <button
            className="primary"
            disabled={loading || opening || !!error}
            onClick={() => {
              notify("");
              setEditing(null);
            }}
          >
            Crear {resource.singular}
          </button>
        )}
      </header>
      {!admin && (
        <p className="readonly">
          Solo lectura ·{" "}
          {teacherOnly
            ? "Grupos asignados a tu cuenta"
            : "Consulta autorizada para tu rol"}
        </p>
      )}
      {success && (
        <p className="success" role="status">
          {success}
        </p>
      )}
      <div className="panel">
        {!teacherOnly && !!resource.filters?.length && (
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
            {resource.filters.map((field) => (
              <div key={field.key}>
                <label htmlFor={`filter-${field.key}`}>{field.label}</label>
                {field.reference || field.options ? (
                  <select
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
                  </select>
                ) : (
                  <input
                    key={serialized}
                    id={`filter-${field.key}`}
                    name={field.key}
                    defaultValue={query.get(field.key) ?? ""}
                    maxLength={field.max}
                  />
                )}
              </div>
            ))}
            {resource.filters.some(
              (field) => !field.reference && !field.options,
            ) && <button disabled={loading}>Buscar</button>}
            <button
              type="button"
              onClick={() => navigate(path)}
              disabled={loading || !serialized}
            >
              Limpiar filtros
            </button>
          </form>
        )}
        {!loading && error ? (
          <div className="empty">
            <p role="alert" className="error">
              {error}
            </p>
            <button onClick={() => reload((value) => value + 1)}>
              Reintentar
            </button>
          </div>
        ) : loading ? (
          <div className="empty" role="status">
            Cargando {resource.title.toLowerCase()}…
          </div>
        ) : !data.items.length ? (
          <div className="empty">
            <span className="empty-icon" aria-hidden="true">
              □
            </span>
            <h2>No hay registros para mostrar</h2>
            <p>
              {serialized
                ? "Prueba con otros filtros."
                : admin
                  ? `Crea el primer registro de ${resource.title.toLowerCase()} para comenzar.`
                  : "Todavía no hay registros disponibles para tu cuenta."}
            </p>
          </div>
        ) : (
          <div
            className="table-scroll"
            tabIndex={0}
            aria-label={`Tabla de ${resource.title.toLowerCase()}`}
          >
            <table>
              <thead>
                <tr>
                  {resource.columns.map((key) => (
                    <th key={key} scope="col">
                      {resource.fields.find((field) => field.key === key)
                        ?.label ??
                        {
                          nombres: "Nombres",
                          apellido_paterno: "Apellido paterno",
                          roles: "Roles",
                        }[key] ??
                        key}
                    </th>
                  ))}
                  <th scope="col">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => (
                  <tr key={row.id}>
                    {resource.columns.map((key) => (
                      <td key={key}>
                        {key === "activo" || key === "estado" ? (
                          <span
                            className={`badge ${row.activo === false || row.estado === "CERRADO" ? "inactive" : ""}`}
                          >
                            {cell(row, key)}
                          </span>
                        ) : (
                          cell(row, key)
                        )}
                      </td>
                    ))}
                    <td className="row-actions">
                      {admin ? (
                        <>
                          <button
                            className="link-button"
                            disabled={opening}
                            onClick={() => void open(row)}
                          >
                            Editar
                          </button>
                          {resource.key === "usuarios" && (
                            <button
                              className="link-button"
                              onClick={() => setRoleUser(row)}
                            >
                              Roles
                            </button>
                          )}
                          {resource.key === "grupos" && (
                            <button
                              className="link-button"
                              onClick={() => setAssigned(row)}
                            >
                              Asignar docentes
                            </button>
                          )}
                        </>
                      ) : (
                        <button
                          className="link-button"
                          onClick={() => setDetail(row)}
                        >
                          Ver detalle
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && !error && (
          <footer className="pagination">
            <span>{data.items.length} registros en esta página</span>
            <div>
              <button
                disabled={!query.get("after")}
                onClick={() => filter("after", "")}
              >
                Primera página
              </button>
              <button
                disabled={!data.nextCursor}
                onClick={() => {
                  const next = new URLSearchParams(serialized);
                  next.set("after", data.nextCursor!);
                  navigate(`${path}?${next}`);
                }}
              >
                Siguiente
              </button>
            </div>
          </footer>
        )}
      </div>
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
