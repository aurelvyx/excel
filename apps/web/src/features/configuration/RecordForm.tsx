import { Feedback } from "../../shared/ui/Feedback";
import { InputField, SelectField } from "../../shared/ui/Field";
import { Button } from "../../shared/ui/Button";
import { useEffect, useState, type FormEvent } from "react";
import { errorText, text, type Row } from "../../shared/api";
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
function codePart(value: string, max: number) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, max);
}
function unitCode() {
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `UD-${Date.now().toString(36).toUpperCase().slice(-8)}-${random}`;
}
function sectionCode(name: string) {
  const part = codePart(name, 60).replace(/^SECCION/, "");
  return part ? `SEC-${part.slice(0, 11)}` : "";
}
function periodCode(values: Values) {
  const start = String(values.fechaInicio ?? "");
  const year = start.slice(0, 4) || String(new Date().getFullYear());
  const name = String(values.nombre ?? "").toUpperCase();
  const marker = name.match(/(?:^|[\s_-])(II|I|2|1|SEGUNDO|SEGUNDA|PRIMER|PRIMERO|PRIMERA)(?:$|[\s_-])/);
  let cycle = "";
  if (marker) {
    cycle = ["II", "2", "SEGUNDO", "SEGUNDA"].includes(marker[1]) ? "S2" : "S1";
  } else {
    const month = Number(start.slice(5, 7));
    cycle = month >= 7 ? "S2" : "S1";
  }
  const monthDay = start.length >= 10 ? start.slice(5, 7) + start.slice(8, 10) : "";
  return `PER-${year}-${cycle}${monthDay ? `-${monthDay}` : ""}`;
}
function groupCode(values: Values, lookups: Record<string, Row[]>) {
  const find = (key: string, id: string | string[] | undefined) =>
    (lookups[key] ?? []).find((item) => String(item.id) === String(id ?? ""));
  const period = find("periodos", values.periodoId);
  const level = find("niveles", values.nivelId);
  const shift = find("turnos", values.turnoId);
  const section = find("secciones", values.seccionId);
  if (!period || !level || !shift || !section) return "";

  const periodIdentifier = text(period, "codigo");
  const year = periodIdentifier.match(/20(\d{2})/)?.[1] ??
    text(period, "fecha_inicio").slice(2, 4);
  const cycle = periodIdentifier.match(/S[12]/i)?.[0].toUpperCase() ??
    (Number(text(period, "fecha_inicio").slice(5, 7)) >= 7 ? "S2" : "S1");
  const levelLanguage = (lookups.idiomas ?? []).find(
    (item) => String(item.id) === text(level, "idioma_id"),
  );
  const languageCode = codePart(
    text(levelLanguage ?? {}, "codigo") || text(levelLanguage ?? {}, "nombre"),
    3,
  );
  const order = String(text(level, "orden") || "").padStart(2, "0");
  const levelIdentifier = languageCode && order
    ? `${languageCode}${order}`
    : codePart(text(level, "codigo") || text(level, "nombre"), 7);
  const shiftName = text(shift, "nombre").replace(/^TURNO\s*/i, "");
  const shiftIdentifier = codePart(shiftName, 3);
  const sectionIdentifier = codePart(text(section, "codigo"), 15)
    .replace(/^SEC/, "")
    .slice(0, 4) || codePart(text(section, "nombre"), 4);
  if (!year || !levelIdentifier || !shiftIdentifier || !sectionIdentifier) return "";
  return `GR-${year}${cycle}-${levelIdentifier}-${shiftIdentifier}-${sectionIdentifier}`.slice(0, 30);
}
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
  const [values, setValues] = useState<Values>(() => {
    const base = Object.fromEntries(
      fields.map((field) => [
        field.key,
        field.type === "roles"
          ? ((row?.roles as string[]) ?? [])
          : !row && resource.key === "unidades" && field.key === "codigo"
            ? unitCode()
          : fieldValue(field, row ?? initial) ||
            (field.type === "select" ? (field.options?.[0] ?? "") : ""),
      ]),
    );
    if (resource.key === "grupos") {
      if (row) {
        const currentLvl = (lookups.niveles ?? []).find(
          (n) => String(n.id) === String(row.nivel_id || row.nivelId),
        );
        base.idiomaId = currentLvl ? String(currentLvl.idioma_id) : "";
      } else {
        const defaultSec = (lookups.secciones ?? []).find(
          (s) => s.activo !== false,
        );
        if (!base.seccionId && defaultSec) {
          base.seccionId = String(defaultSec.id);
        }
        base.idiomaId = (lookups.idiomas ?? [])[0]
          ? String(lookups.idiomas[0].id)
          : "";
        base.docenteId = "";
      }
    }
    return base;
  });
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
  useEffect(() => {
    if (editing) return;
    let generated = "";
    if (resource.key === "niveles") {
      const language = lookups.idiomas?.find(
        (item) => String(item.id) === String(values.idiomaId ?? ""),
      );
      const languageCode = codePart(
        text(language ?? {}, "codigo") || text(language ?? {}, "nombre") || "IDIOMA",
        5,
      );
      const levelName = codePart(String(values.nombre ?? ""), 9);
      const rawOrder = String(values.orden ?? "").trim();
      const order = rawOrder ? String(Number(rawOrder)).padStart(2, "0") : "";
      const levelLimit = Math.max(
        1,
        20 - languageCode.length - 1 - (order ? order.length + 1 : 0),
      );
      generated = `${languageCode}-${levelName.slice(0, levelLimit)}${order ? `-${order}` : ""}`;
    } else if (resource.key === "periodos") {
      generated = periodCode(values);
    } else if (resource.key === "secciones") {
      generated = sectionCode(String(values.nombre ?? ""));
    } else if (resource.key === "grupos") {
      generated = groupCode(values, lookups);
    }
    setValues((old) =>
      old.codigo === generated ? old : { ...old, codigo: generated },
    );
  }, [
    editing,
    lookups,
    resource.key,
    values.fechaInicio,
    values.idiomaId,
    values.nombre,
    values.orden,
    values.periodoId,
    values.nivelId,
    values.turnoId,
    values.seccionId,
  ]);
  const change = (key: string, value: string | string[]) => {
    setValues((old) => {
      const next = { ...old, [key]: value };
      if (resource.key === "grupos" && key === "idiomaId") {
        const currentLevel = (lookups.niveles ?? []).find(
          (n) => String(n.id) === String(old.nivelId),
        );
        if (currentLevel && String(currentLevel.idioma_id) !== String(value)) {
          next.nivelId = "";
        }
      }
      return next;
    });
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
    if (resource.key === "grupos") {
      if (values.docenteId) body.docenteId = values.docenteId;
      if (values.idiomaId) body.idiomaId = values.idiomaId;
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

  const renderFormField = (field: Field) => {
    const id = `field-${field.key}`;
    let choices = field.reference ? (lookups[field.reference] ?? []) : [];
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
    if (
      resource.key === "grupos" &&
      field.key === "nivelId" &&
      values.idiomaId
    ) {
      choices = choices.filter(
        (item) => String(item.idioma_id) === String(values.idiomaId),
      );
    }
    if (field.type === "roles")
      return (
        <fieldset
          key={field.key}
          className="roles span-2"
          aria-describedby={errors[field.key] ? `${id}-error` : undefined}
        >
          <legend>{field.label}</legend>
          {Object.entries(roleNames).map(([role, label]) => (
            <label key={role}>
              <input
                type="checkbox"
                checked={(values[field.key] as string[]).includes(role)}
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
          {errors[field.key] && (
            <small className="field-error" id={`${id}-error`}>
              {errors[field.key]}
            </small>
          )}
        </fieldset>
      );
    const shared = {
      id,
      name: field.key,
      label: field.label,
      required: field.required,
      disabled: busy || !!locked(field),
      error: errors[field.key],
      hint: [
        field.hint,
        !editing && field.key === "codigo" && resource.key === "niveles"
          ? "Generado automáticamente: idioma, nivel y orden."
          : !editing && field.key === "codigo" && resource.key === "secciones"
            ? "Generado automáticamente desde el nombre de la sección."
            : !editing && field.key === "codigo" && resource.key === "grupos"
              ? "Generado automáticamente desde periodo, nivel, turno y sección."
              : !editing && field.key === "codigo" && resource.key === "unidades"
                ? "Identificador interno generado automáticamente."
                : !editing && field.key === "codigo" && resource.key === "periodos"
                  ? "Generado automáticamente como PER-año-ciclo-fecha (por ejemplo, PER-2026-S1-0301)."
                  : "",
        locked(field) ? "El contexto se conserva para proteger el historial." : "",
      ]
        .filter(Boolean)
        .join(" "),
      fieldClassName: field.key === "motivo" ? "span-2" : "field",
      value: values[field.key] as string,
    };
    return field.reference || field.type === "select" ? (
      <SelectField
        key={field.key}
        {...shared}
        onChange={(event) => change(field.key, event.target.value)}
      >
        <option value="">
          {field.required ? "Selecciona una opción" : "Sin especificar"}
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
                  : labels[option] ?? option}
              </option>
            ))}
      </SelectField>
    ) : (
      <InputField
        key={field.key}
        {...shared}
        type={field.type ?? "text"}
        onChange={(event) => change(field.key, event.target.value)}
        autoComplete={field.type === "password" ? "new-password" : "off"}
        maxLength={field.type !== "number" ? field.max : undefined}
        min={field.type === "number" ? field.min : undefined}
        max={field.type === "number" ? field.max : undefined}
        step={field.type === "number" ? 1 : undefined}
        readOnly={
          !editing &&
          field.key === "codigo" &&
          ["niveles", "unidades", "periodos", "secciones", "grupos"].includes(
            resource.key,
          )
        }
      />
    );
  };

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
              {resource.key === "grupos" && values.idiomaId && (
                <div>
                  <dt>Idioma</dt>
                  <dd>
                    {text(
                      (lookups.idiomas ?? []).find(
                        (i) => String(i.id) === String(values.idiomaId),
                      ) ?? {},
                      "nombre",
                    ) || "—"}
                  </dd>
                </div>
              )}
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
              {resource.key === "grupos" && !editing && values.docenteId && (
                <div>
                  <dt>Docente titular</dt>
                  <dd>
                    {optionLabel(
                      (lookups.docentes ?? []).find(
                        (d) => String(d.id) === String(values.docenteId),
                      ) ?? { id: "" },
                      "docentes",
                      lookups,
                    )}
                  </dd>
                </div>
              )}
            </dl>
            {(values.activo === "false" || values.estado === "CERRADO") && (
              <p className="notice">
                Este cambio deja el registro inactivo o cerrado. Se conservará
                el historial.
              </p>
            )}
          </section>
        ) : resource.key === "grupos" ? (
          <div className="group-form-flow">
            <fieldset className="form-group-section">
              <legend className="form-group-legend">
                <span className="step-num">1</span> Oferta y Ciclo Académico
              </legend>
              <div className="form-grid">
                {visible.find((f) => f.key === "periodoId") &&
                  renderFormField(visible.find((f) => f.key === "periodoId")!)}
                <SelectField
                  id="field-idiomaId"
                  name="idiomaId"
                  label="Idioma"
                  value={String(values.idiomaId ?? "")}
                  disabled={
                    busy ||
                    (editing &&
                      !!locked(visible.find((f) => f.key === "nivelId")!))
                  }
                  hint="Filtra los niveles disponibles según el idioma seleccionado."
                  onChange={(event) => change("idiomaId", event.target.value)}
                >
                  <option value="">Todos los idiomas</option>
                  {(lookups.idiomas ?? [])
                    .filter((i) => i.activo !== false)
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        {text(i, "nombre")}
                      </option>
                    ))}
                </SelectField>
                {visible.find((f) => f.key === "nivelId") &&
                  renderFormField(visible.find((f) => f.key === "nivelId")!)}
              </div>
            </fieldset>

            <fieldset className="form-group-section">
              <legend className="form-group-legend">
                <span className="step-num">2</span> Turno y organización del grupo
              </legend>
              <div className="form-grid">
                {visible.find((f) => f.key === "turnoId") &&
                  renderFormField(visible.find((f) => f.key === "turnoId")!)}
                {visible.find((f) => f.key === "seccionId") &&
                  renderFormField(visible.find((f) => f.key === "seccionId")!)}
                {visible.find((f) => f.key === "capacidad") &&
                  renderFormField(visible.find((f) => f.key === "capacidad")!)}
              </div>
            </fieldset>

            <fieldset className="form-group-section">
              <legend className="form-group-legend">
                <span className="step-num">3</span> Docencia y Registro
              </legend>
              <div className="form-grid">
                {!editing && (
                  <SelectField
                    id="field-docenteId"
                    name="docenteId"
                    label="Docente titular (opcional)"
                    value={String(values.docenteId ?? "")}
                    disabled={busy}
                    hint="Se asignará de inmediato al guardar la clase."
                    onChange={(event) =>
                      change("docenteId", event.target.value)
                    }
                  >
                    <option value="">Sin asignar por ahora</option>
                    {(lookups.docentes ?? [])
                      .filter((d) => d.activo !== false)
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {optionLabel(d, "docentes", lookups)}
                        </option>
                      ))}
                  </SelectField>
                )}
                {visible.find((f) => f.key === "estado") &&
                  renderFormField(visible.find((f) => f.key === "estado")!)}
                {visible.find((f) => f.key === "codigo") &&
                  renderFormField(visible.find((f) => f.key === "codigo")!)}
                {visible.find((f) => f.key === "motivo") &&
                  renderFormField(visible.find((f) => f.key === "motivo")!)}
              </div>
            </fieldset>
          </div>
        ) : (
          <div className="form-grid">{visible.map(renderFormField)}</div>
        )}
        <Feedback tone="error">{error}</Feedback>
        <footer className="actions">
          <Button
            type="button"
            disabled={busy}
            onClick={review ? () => confirm(false) : onClose}
          >
            {review ? "Volver a editar" : "Cancelar"}
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy
              ? "Guardando…"
              : review
                ? "Confirmar y guardar"
                : "Revisar cambios"}
          </Button>
        </footer>
      </form>
    </Dialog>
  );
}
