import { useState, type FormEvent } from "react";
import { errorText, type Row } from "../../shared/api";
import { Dialog } from "../../shared/Dialog";
import {
  fieldValue,
  labels,
  optionLabel,
  reason,
  roleNames,
  type Field,
  type Resource,
} from "./model";
type Values = Record<string, string | string[]>;
export function RecordForm({
  resource,
  row,
  initial,
  lookups,
  onClose,
  onSave,
}: {
  resource: Resource;
  row?: Row;
  initial?: Row;
  lookups: Record<string, Row[]>;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => Promise<void>;
}) {
  const editing = !!row;
  const fields = [
    ...resource.fields.filter(
      (field) =>
        !(editing && field.createOnly) && !(!editing && field.editOnly),
    ),
    ...(editing || resource.key === "asignacion" ? [reason] : []),
  ];
  const [values, setValues] = useState<Values>(() =>
    Object.fromEntries(
      fields.map((field) => [
        field.key,
        field.type === "roles"
          ? ((row?.roles as string[]) ?? [])
          : fieldValue(field, row ?? initial) ||
            (field.type === "select" ? (field.options?.[0] ?? "") : ""),
      ]),
    ),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, fail] = useState("");
  const [busy, pending] = useState(false);
  const [review, confirm] = useState(false);
  const visible = fields.filter(
    (field) =>
      !(
        resource.key === "docentes" &&
        !editing &&
        values.personaId &&
        field.key.startsWith("persona.")
      ),
  );
  const change = (key: string, value: string | string[]) => {
    setValues((old) => ({ ...old, [key]: value }));
    setErrors((old) => ({ ...old, [key]: "" }));
    confirm(false);
  };
  const locked = (field: Field) => editing && field.immutable;
  function validate() {
    const issues: Record<string, string> = {};
    for (const field of visible) {
      if (locked(field)) continue;
      const value = values[field.key] ?? "";
      if (
        field.required &&
        (!value.length || (typeof value === "string" && !value.trim()))
      )
        issues[field.key] = "Completa este campo.";
      if (typeof value === "string" && value) {
        if (
          field.type === "number" &&
          (!Number.isInteger(Number(value)) ||
            Number(value) < (field.min ?? 0) ||
            Number(value) > (field.max ?? Infinity))
        )
          issues[field.key] =
            `Usa un entero entre ${field.min ?? 0} y ${field.max}.`;
        if (field.pattern && !new RegExp(`^(?:${field.pattern})$`).test(value))
          issues[field.key] = "Revisa el formato indicado.";
        if (field.type !== "number" && field.max && value.length > field.max)
          issues[field.key] = `Máximo ${field.max} caracteres.`;
        if (field.type !== "number" && field.min && value.length < field.min)
          issues[field.key] = `Mínimo ${field.min} caracteres.`;
        if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
          issues[field.key] = "Escribe un correo válido.";
      }
    }
    for (const [start, end] of [
      ["fechaInicio", "fechaFin"],
      ["matriculaInicio", "matriculaFin"],
      ["horaInicio", "horaFin"],
    ]) {
      if (
        values[start] &&
        values[end] &&
        (start === "horaInicio"
          ? values[start] >= values[end]
          : values[start] > values[end])
      )
        issues[end] = "La fecha u hora final debe ser posterior al inicio.";
    }
    if (
      resource.key === "turnos" &&
      Boolean(values.horaInicio) !== Boolean(values.horaFin)
    )
      issues[values.horaInicio ? "horaFin" : "horaInicio"] =
        "Completa ambas horas o deja las dos vacías.";
    setErrors(issues);
    return Object.keys(issues).length === 0;
  }
  function payload() {
    const body: Record<string, unknown> = {};
    for (const field of visible) {
      if (locked(field)) continue;
      const value = values[field.key] ?? "";
      if (
        resource.key === "usuarios" &&
        !editing &&
        field.key === "personaId" &&
        !value
      )
        continue;
      if (
        editing &&
        field.key !== "motivo" &&
        field.type !== "roles" &&
        value === fieldValue(field, row)
      )
        continue;
      if (value === "" && !field.nullable) continue;
      const actual =
        value === ""
          ? null
          : field.key === "activo" || field.key === "esTitular"
            ? value === "true"
            : field.type === "number"
              ? Number(value)
              : value;
      const [parent, child] = field.key.split(".");
      if (child)
        body[parent] = { ...((body[parent] as object) ?? {}), [child]: actual };
      else body[parent] = actual;
    }
    return body;
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validate()) {
      setTimeout(
        () =>
          document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
        0,
      );
      return;
    }
    const body = payload();
    if (editing && Object.keys(body).every((key) => key === "motivo")) {
      fail("No has realizado cambios.");
      return;
    }
    if (!review) {
      confirm(true);
      return;
    }
    pending(true);
    fail("");
    try {
      await onSave(body);
    } catch (e) {
      fail(errorText(e));
      confirm(false);
    } finally {
      pending(false);
    }
  }
  return (
    <Dialog
      title={`${editing ? "Editar" : "Crear"} ${resource.singular}`}
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={submit} noValidate>
        <p className="muted">{resource.description}</p>
        {resource.key === "usuarios" && editing && (
          <p className="notice">
            Guardar cambios cerrará las sesiones de esta cuenta.
          </p>
        )}
        {review ? (
          <section className="review">
            <h3>Revisa antes de guardar</h3>
            <dl>
              {visible
                .filter((f) => f.type !== "password")
                .map((field) => (
                  <div key={field.key}>
                    <dt>{field.label}</dt>
                    <dd>
                      {Array.isArray(values[field.key])
                        ? (values[field.key] as string[])
                            .map((role) => roleNames[role])
                            .join(", ")
                        : field.reference
                          ? optionLabel(
                              (lookups[field.reference] ?? []).find(
                                (item) => String(item.id) === values[field.key],
                              ) ?? { id: "", nombre: values[field.key] },
                              field.reference,
                              lookups,
                            )
                          : field.key === "esTitular"
                            ? values[field.key] === "true"
                              ? "Titular"
                              : "Apoyo"
                            : (labels[values[field.key] as string] ??
                              values[field.key] ??
                              "—")}
                    </dd>
                  </div>
                ))}
            </dl>
            {(values.activo === "false" || values.estado === "CERRADO") && (
              <p className="notice">
                Este cambio deja el registro inactivo o cerrado. Se conservará
                el historial.
              </p>
            )}
          </section>
        ) : (
          <div className="form-grid">
            {visible.map((field) => {
              const id = `field-${field.key}`;
              let choices = field.reference
                ? (lookups[field.reference] ?? [])
                : [];
              if (field.reference)
                choices = choices.filter(
                  (item) =>
                    String(item.id) === values[field.key] ||
                    (item.activo !== false && item.estado !== "CERRADO"),
                );
              if (field.key === "prerrequisitoId")
                choices = choices.filter(
                  (item) =>
                    String(item.id) !== String(row?.id) &&
                    String(item.idioma_id) === values.idiomaId &&
                    Number(item.orden) < Number(values.orden),
                );
              const shared = {
                id,
                name: field.key,
                disabled: busy || !!locked(field),
                "aria-invalid": !!errors[field.key],
                "aria-describedby": errors[field.key]
                  ? `${id}-error`
                  : field.hint
                    ? `${id}-hint`
                    : undefined,
              };
              return (
                <div
                  className={
                    field.key === "motivo" || field.type === "roles"
                      ? "span-2"
                      : "field"
                  }
                  key={field.key}
                >
                  <label htmlFor={field.type === "roles" ? undefined : id}>
                    {field.label}
                    {field.required && <span aria-hidden="true"> *</span>}
                  </label>
                  {field.type === "roles" ? (
                    <fieldset
                      className="roles"
                      aria-label={field.label}
                      aria-describedby={
                        errors[field.key] ? `${id}-error` : undefined
                      }
                    >
                      <legend className="sr-only">
                        Selecciona uno o varios roles
                      </legend>
                      {Object.entries(roleNames).map(([role, label]) => (
                        <label key={role}>
                          <input
                            type="checkbox"
                            checked={(values[field.key] as string[]).includes(
                              role,
                            )}
                            disabled={busy}
                            onChange={(event) =>
                              change(
                                field.key,
                                event.target.checked
                                  ? [...(values[field.key] as string[]), role]
                                  : (values[field.key] as string[]).filter(
                                      (item) => item !== role,
                                    ),
                              )
                            }
                          />
                          {label}
                        </label>
                      ))}
                    </fieldset>
                  ) : field.reference || field.type === "select" ? (
                    <select
                      {...shared}
                      value={values[field.key] as string}
                      onChange={(event) =>
                        change(field.key, event.target.value)
                      }
                    >
                      <option value="">
                        {field.required
                          ? "Selecciona una opción"
                          : "Sin especificar"}
                      </option>
                      {field.reference
                        ? choices.map((item) => (
                            <option key={item.id} value={item.id}>
                              {optionLabel(item, field.reference!, lookups)}
                            </option>
                          ))
                        : field.options?.map((option) => (
                            <option key={option} value={option}>
                              {field.key === "esTitular"
                                ? option === "true"
                                  ? "Titular"
                                  : "Apoyo"
                                : (labels[option] ?? option)}
                            </option>
                          ))}
                    </select>
                  ) : (
                    <input
                      {...shared}
                      type={field.type ?? "text"}
                      value={values[field.key] as string}
                      onChange={(event) =>
                        change(field.key, event.target.value)
                      }
                      autoComplete={
                        field.type === "password" ? "new-password" : "off"
                      }
                      maxLength={
                        field.type !== "number" ? field.max : undefined
                      }
                      min={field.type === "number" ? field.min : undefined}
                      max={field.type === "number" ? field.max : undefined}
                      step={field.type === "number" ? 1 : undefined}
                    />
                  )}
                  {field.hint && (
                    <small id={`${id}-hint`} className="help">
                      {field.hint}
                    </small>
                  )}
                  {locked(field) && (
                    <small className="help">
                      El contexto se conserva para proteger el historial.
                    </small>
                  )}
                  {errors[field.key] && (
                    <small className="field-error" id={`${id}-error`}>
                      {errors[field.key]}
                    </small>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <footer className="actions">
          <button
            type="button"
            disabled={busy}
            onClick={review ? () => confirm(false) : onClose}
          >
            {review ? "Volver a editar" : "Cancelar"}
          </button>
          <button className="primary" disabled={busy}>
            {busy
              ? "Guardando…"
              : review
                ? "Confirmar y guardar"
                : "Revisar cambios"}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
