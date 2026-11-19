import { useState, type FormEvent } from "react";
import { ClipboardCheck, Fingerprint, UserRound } from "lucide-react";
import { api, errorText, text, type Row } from "../../shared/api";
import { navigate } from "../../shared/navigation";
import { Dialog } from "../../shared/Dialog";
import { InputField } from "../../shared/ui/Field";
import { Feedback } from "../../shared/ui/Feedback";
import { Button } from "../../shared/ui/Button";
import { RecordForm } from "../configuration/RecordForm";
import { studentResource } from "./model";
import "./registration.css";

function registrationDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function RegisterStudent({
  onClose,
  onSaved,
  onExisting,
}: {
  onClose: () => void;
  onSaved: (row: Row) => void;
  onExisting?: (row: Row) => Promise<void>;
}) {
  const [type, setType] = useState("DNI");
  const [number, setNumber] = useState("");
  const [error, fail] = useState("");
  const [busy, pending] = useState(false);
  const [found, setFound] = useState<Row | null | undefined>(undefined);
  const [initial, setInitial] = useState<Row | null>(null);
  async function check(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    pending(true);
    fail("");
    setFound(undefined);
    try {
      const result = await api<{ registro: Row | null }>(
        `estudiantes/documento?${new URLSearchParams({ tipoDocumento: type.trim(), numeroDocumento: number.trim() })}`,
      );
      setFound(result.registro);
      if (!result.registro)
        setInitial({
          id: "",
          fecha_registro: registrationDate(),
          persona: {
            tipoDocumento: type.trim(),
            numeroDocumento: number.trim(),
          },
        });
    } catch (e) {
      fail(errorText(e));
    } finally {
      pending(false);
    }
  }
  if (initial) {
    const reuse = !!initial.personaId;
    const resource = reuse
      ? {
          ...studentResource,
          description: `Se vinculará a ${text(initial, "persona.nombres")} ${text(initial, "persona.apellidoPaterno")}, ${type} ${number}.`,
          fields: studentResource.fields.filter(
            (f) => !f.key.startsWith("persona."),
          ),
        }
      : studentResource;
    return (
      <RecordForm
        className="student-registration-dialog"
        resource={resource}
        initial={initial}
        lookups={{}}
        onClose={onClose}
        onSave={async (body) => {
          const row = await api<Row>("estudiantes", {
            method: "POST",
            body: {
              ...body,
              ...(reuse ? { personaId: initial.personaId } : {}),
            },
          });
          onSaved(row);
        }}
      />
    );
  }
  return (
    <Dialog
      title="Comprobar documento"
      onClose={onClose}
      busy={busy}
      className="student-registration-dialog"
    >
      <ol
        className="student-registration-progress"
        aria-label="Etapas del registro de estudiante"
      >
        <li aria-current="step">
          <Fingerprint size={18} aria-hidden="true" />
          <span>
            <strong>Documento</strong>
            <small>Consulta de identidad</small>
          </span>
        </li>
        <li>
          <UserRound size={18} aria-hidden="true" />
          <span>
            <strong>Datos personales</strong>
            <small>Registro y contacto</small>
          </span>
        </li>
        <li>
          <ClipboardCheck size={18} aria-hidden="true" />
          <span>
            <strong>Confirmación</strong>
            <small>Revisar y guardar</small>
          </span>
        </li>
      </ol>
      <div className="student-db-alert student-registration-notice">
        <Fingerprint size={23} aria-hidden="true" />
        <div>
          <strong>Registrar o reutilizar estudiante</strong>
          <span>
            Busca primero el documento para conservar una sola identidad y su
            historial académico.
          </span>
        </div>
      </div>
      <form onSubmit={check} className="student-document-form">
        <fieldset className="student-document-fields">
          <legend>Identificación del estudiante</legend>
          <div className="form-grid">
            <InputField
              label="Tipo de documento"
              id="doc-type"
              required
              maxLength={20}
              list="student-document-types"
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setFound(undefined);
              }}
              disabled={busy}
            />
            <datalist id="student-document-types">
              <option value="DNI" />
              <option value="CE" />
              <option value="PASAPORTE" />
            </datalist>
            <InputField
              label="Número de documento"
              id="doc-number"
              required
              maxLength={25}
              value={number}
              onChange={(e) => {
                setNumber(e.target.value);
                setFound(undefined);
              }}
              disabled={busy}
            />
          </div>
        </fieldset>
        <div className="actions">
          <Button type="button" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Buscando…" : "Comprobar documento"}
          </Button>
        </div>
      </form>
      <Feedback tone="error">{error}</Feedback>
      {found && (
        <div className="notice student-existing-person">
          <p>
            Persona registrada: {text(found, "persona.nombres")}{" "}
            {text(found, "persona.apellidoPaterno")}.
          </p>
          {found.estudiante_id ? (
            <>
              <p>
                Ya existe como estudiante: {text(found, "codigo_estudiante")}.
              </p>
              <Button
                disabled={busy}
                onClick={async () => {
                  if (onExisting) {
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
                  } else {
                    onClose();
                    navigate(`/estudiantes/${found.estudiante_id}`);
                  }
                }}
              >
                Abrir estudiante existente
              </Button>
            </>
          ) : text(found, "persona.activo") === "false" ? (
            <p>
              La persona está inactiva. Solicita su revisión a administración.
            </p>
          ) : (
            <Button
              onClick={() =>
                setInitial({
                  id: "",
                  fecha_registro: registrationDate(),
                  personaId: text(found, "persona.id"),
                  persona: found.persona,
                })
              }
            >
              Usar esta persona
            </Button>
          )}
        </div>
      )}
    </Dialog>
  );
}
