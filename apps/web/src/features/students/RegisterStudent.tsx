import { useState, type FormEvent } from "react";
import { api, errorText, text, type Row } from "../../shared/api";
import { navigate } from "../../shared/navigation";
import { Dialog } from "../../shared/Dialog";
import { InputField } from "../../shared/ui/Field";
import { Feedback } from "../../shared/ui/Feedback";
import { Button } from "../../shared/ui/Button";
import { RecordForm } from "../configuration/RecordForm";
import { studentResource } from "./model";
export function RegisterStudent({
  onClose,
  onSaved,
  onExisting,
}: {
  onClose: () => void;
  onSaved: (row: Row) => void;
  onExisting?: (row: Row) => Promise<void>;
}) {
  const [type, setType] = useState("");
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
    <Dialog title="Comprobar documento" onClose={onClose} busy={busy}>
      <p>Busca primero para evitar duplicar la identidad de una persona.</p>
      <form onSubmit={check}>
        <div className="form-grid">
          <InputField
            label="Tipo de documento"
            id="doc-type"
            required
            maxLength={20}
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setFound(undefined);
            }}
            disabled={busy}
          />
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
        <div className="notice">
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
