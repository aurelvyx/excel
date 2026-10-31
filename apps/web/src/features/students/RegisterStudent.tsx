import { useEffect, useState, type FormEvent } from "react";
import { api, errorText, text, type Row } from "../../shared/api";
import { Dialog } from "../../shared/Dialog";
import { InputField, SelectField } from "../../shared/ui/Field";
import { Feedback } from "../../shared/ui/Feedback";
import { Button } from "../../shared/ui/Button";

type StudentDetails = {
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  fechaNacimiento: string;
  telefono: string;
  correo: string;
  direccion: string;
};
export type StudentDraft = {
  personaId?: string;
  persona?: {
    tipoDocumento: string;
    numeroDocumento: string;
    nombres: string;
    apellidoPaterno: string;
    apellidoMaterno?: string;
    fechaNacimiento?: string;
    telefono?: string;
    correo?: string;
    direccion?: string;
  };
  codigoEstudiante: string;
  fechaRegistro: string;
  resumen: { nombre: string; documento: string };
};

const emptyDetails: StudentDetails = {
  nombres: "",
  apellidoPaterno: "",
  apellidoMaterno: "",
  fechaNacimiento: "",
  telefono: "",
  correo: "",
  direccion: "",
};
function localDate() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}
function generatedCode(name: string, document: string) {
  const letters = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]/gi, "")
    .slice(0, 3)
    .toUpperCase()
    .padEnd(3, "X");
  const digits = document.replace(/\D/g, "");
  let suffix = "";
  for (let index = 0; index < 4; index += 1) {
    suffix += digits.length
      ? digits[Math.floor(Math.random() * digits.length)]
      : String(Math.floor(Math.random() * 10));
  }
  return `${letters}${suffix}`;
}

export function RegisterStudent({
  onClose,
  onDraft,
  onExisting,
  embedded = false,
}: {
  onClose: () => void;
  onDraft: (draft: StudentDraft) => void;
  onExisting: (row: Row) => Promise<void>;
  embedded?: boolean;
}) {
  const [type, setType] = useState("DNI");
  const [number, setNumber] = useState("");
  const [error, fail] = useState("");
  const [busy, pending] = useState(false);
  const [found, setFound] = useState<Row | null | undefined>(undefined);
  const [personId, setPersonId] = useState("");
  const [details, setDetails] = useState<StudentDetails>(emptyDetails);
  const [editingDetails, editDetails] = useState(false);
  const [code, setCode] = useState("");

  useEffect(() => {
    if (editingDetails)
      setCode(generatedCode(details.nombres, number));
  }, [details.nombres, editingDetails, number]);

  async function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    pending(true);
    fail("");
    setFound(undefined);
    setPersonId("");
    editDetails(false);
    try {
      const result = await api<{ registro: Row | null }>(
        `estudiantes/documento?${new URLSearchParams({ tipoDocumento: type, numeroDocumento: number.trim() })}`,
      );
      setFound(result.registro);
      if (result.registro) {
        if (result.registro.estudiante_id) return;
        if (text(result.registro, "persona.activo") === "false") return;
        const person = result.registro.persona as Row;
        setPersonId(text(person, "id"));
        setDetails({
          nombres: text(person, "nombres"),
          apellidoPaterno: text(person, "apellidoPaterno"),
          apellidoMaterno: text(person, "apellidoMaterno"),
          fechaNacimiento: text(person, "fechaNacimiento"),
          telefono: text(person, "telefono"),
          correo: text(person, "correo"),
          direccion: text(person, "direccion"),
        });
      } else {
        setDetails(emptyDetails);
        setPersonId("");
      }
      editDetails(true);
    } catch (e) {
      fail(errorText(e));
    } finally {
      pending(false);
    }
  }

  function submitDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const draft: StudentDraft = {
      ...(personId ? { personaId: personId } : {}),
      ...(!personId
        ? {
            persona: {
              tipoDocumento: type,
              numeroDocumento: number.trim(),
              nombres: details.nombres,
              apellidoPaterno: details.apellidoPaterno,
              ...(details.apellidoMaterno
                ? { apellidoMaterno: details.apellidoMaterno }
                : {}),
              ...(details.fechaNacimiento
                ? { fechaNacimiento: details.fechaNacimiento }
                : {}),
              ...(details.telefono ? { telefono: details.telefono } : {}),
              ...(details.correo ? { correo: details.correo } : {}),
              ...(details.direccion ? { direccion: details.direccion } : {}),
            },
          }
        : {}),
      codigoEstudiante: code,
      fechaRegistro: localDate(),
      resumen: {
        nombre: [details.nombres, details.apellidoPaterno, details.apellidoMaterno]
          .filter(Boolean)
          .join(" "),
        documento: `${type} ${number.trim()}`,
      },
    };
    onDraft(draft);
  }

  const content = (
    <>
      <p>Los datos se guardarán al confirmar la matrícula y el voucher.</p>
      {!editingDetails ? (
        <>
          <form onSubmit={check}>
            <div className="form-grid">
              <SelectField
                label="Tipo de documento"
                id="new-student-document-type"
                value={type}
                onChange={(event) => {
                  setType(event.target.value);
                  setFound(undefined);
                  fail("");
                }}
                disabled={busy}
              >
                <option value="DNI">DNI</option>
                <option value="PASAPORTE">Pasaporte</option>
              </SelectField>
              <InputField
                label="Número de documento"
                id="new-student-document-number"
                required
                maxLength={type === "DNI" ? 8 : 25}
                minLength={type === "DNI" ? 8 : 1}
                pattern={type === "DNI" ? "[0-9]{8}" : undefined}
                inputMode={type === "DNI" ? "numeric" : undefined}
                value={number}
                onChange={(event) => {
                  setNumber(event.target.value);
                  setFound(undefined);
                  fail("");
                }}
                disabled={busy}
              />
            </div>
            <div className="actions">
              {!embedded && (
                <Button type="button" onClick={onClose} disabled={busy}>
                  Cancelar
                </Button>
              )}
              <Button type="submit" variant="primary" disabled={busy}>
                {busy ? "Comprobando…" : "Continuar"}
              </Button>
            </div>
          </form>
          <Feedback tone="error">{error}</Feedback>
          {found?.estudiante_id && (
            <div className="student-db-alert" style={{ marginTop: "1rem" }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <div style={{ flex: 1 }}>
                <strong>✓ Ya hay datos registrados de este estudiante en el sistema</strong>
                <p style={{ margin: "0.25rem 0 0.75rem", fontSize: "0.84rem", color: "#065f46" }}>
                  El documento ingresado pertenece al estudiante activo con código <strong>{text(found, "codigo_estudiante")}</strong>. No es necesario registrarlo de nuevo.
                </p>
                <Button
                  variant="primary"
                  disabled={busy}
                  onClick={async () => {
                    pending(true);
                    fail("");
                    try {
                      await onExisting(
                        await api<Row>(`estudiantes/${found.estudiante_id}`),
                      );
                    } catch (e) {
                      fail(errorText(e));
                    } finally {
                      pending(false);
                    }
                  }}
                >
                  Usar estudiante registrado en BD
                </Button>
                {error && <Feedback tone="error">{error}</Feedback>}
              </div>
            </div>
          )}
          {found && !found.estudiante_id &&
            text(found, "persona.activo") === "false" && (
              <Feedback tone="notice">
                La persona está inactiva. Solicita su revisión a administración.
              </Feedback>
            )}
        </>
      ) : (
        <form onSubmit={submitDetails}>
          <p>
            Documento comprobado: {type} {number}
            {personId ? " · Se usará la persona existente" : ""}
          </p>
          <div className="form-grid">
            <InputField
              label="Nombres"
              id="new-student-names"
              required={!personId}
              value={details.nombres}
              disabled={!!personId}
              onChange={(event) =>
                setDetails({ ...details, nombres: event.target.value })
              }
            />
            <InputField
              label="Apellido paterno"
              id="new-student-lastname"
              required={!personId}
              value={details.apellidoPaterno}
              disabled={!!personId}
              onChange={(event) =>
                setDetails({ ...details, apellidoPaterno: event.target.value })
              }
            />
            {!personId && (
              <InputField
                label="Apellido materno"
                id="new-student-second-lastname"
                value={details.apellidoMaterno}
                onChange={(event) =>
                  setDetails({ ...details, apellidoMaterno: event.target.value })
                }
              />
            )}
            <InputField
              label="Fecha de nacimiento"
              id="new-student-birthdate"
              type="date"
              value={details.fechaNacimiento}
              disabled={!!personId}
              onChange={(event) =>
                setDetails({ ...details, fechaNacimiento: event.target.value })
              }
            />
            <InputField
              label="Teléfono"
              id="new-student-phone"
              value={details.telefono}
              disabled={!!personId}
              onChange={(event) =>
                setDetails({ ...details, telefono: event.target.value })
              }
            />
            <InputField
              label="Correo"
              id="new-student-email"
              type="email"
              value={details.correo}
              disabled={!!personId}
              onChange={(event) =>
                setDetails({ ...details, correo: event.target.value })
              }
            />
            {!personId && (
              <InputField
                label="Dirección"
                id="new-student-address"
                value={details.direccion}
                onChange={(event) =>
                  setDetails({ ...details, direccion: event.target.value })
                }
              />
            )}
            <InputField
              label="Código de estudiante generado"
              id="new-student-code"
              value={code}
              readOnly
              required
            />
          </div>
          <Feedback tone="error">{error}</Feedback>
          <div className="actions">
            <Button type="button" onClick={() => editDetails(false)}>
              Volver al documento
            </Button>
            <Button type="button" onClick={() => setCode(generatedCode(details.nombres, number))}>
              Generar otro código
            </Button>
            <Button type="submit" variant="primary">
              Continuar a la matrícula
            </Button>
          </div>
        </form>
      )}
    </>
  );
  if (embedded)
    return (
      <section className="enrollment-student-form">
        <header className="selection-toolbar">
          <h2>Registrar estudiante para matrícula</h2>
          <Button disabled={busy} onClick={onClose}>
            Cancelar matrícula
          </Button>
        </header>
        {content}
      </section>
    );
  return (
    <Dialog
      title="Registrar estudiante para matrícula"
      onClose={onClose}
      busy={busy}
    >
      {content}
    </Dialog>
  );
}
