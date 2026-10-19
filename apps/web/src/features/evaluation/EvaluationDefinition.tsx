import { Button } from "../../shared/ui/Button";
import { DataTable } from "../../shared/ui/DataTable";
import { InputField, SelectField } from "../../shared/ui/Field";
import type {
  EvaluationComponent,
  EvaluationDefinition,
  EvaluationUnit,
} from "./model";
import { captureWeightError, captureOrderError } from "./model";

/** La captura no calcula promedios ni sustituye la validación académica de la API. */
export function DefinitionEditor({
  value,
  units,
  disabled,
  attempted,
  onChange,
}: {
  value: EvaluationDefinition;
  units: EvaluationUnit[];
  disabled: boolean;
  attempted: boolean;
  onChange: (value: EvaluationDefinition) => void;
}) {
  function update(index: number, patch: Partial<EvaluationComponent>) {
    onChange({
      evaluaciones: value.evaluaciones.map((entry, at) =>
        at === index ? { ...entry, ...patch } : entry,
      ),
    });
  }
  const totalIndicators = value.evaluaciones.reduce(
    (sum, entry) => sum + entry.indicadores.length,
    0,
  );
  const weightIssue = (weight: string) =>
    attempted ? captureWeightError(weight) : undefined;
  const orderIssue = (order: number) =>
    attempted ? captureOrderError(order) : undefined;
  return (
    <section
      aria-label="Definición de evaluaciones"
      className="evaluation-definition"
    >
      <h2>Evaluaciones e indicadores</h2>
      <p className="help">
        Los pesos se ingresan con punto y hasta dos decimales. Para aprobar, las
        evaluaciones deben sumar 100 % y los indicadores de cada evaluación
        también. Un borrador puede quedar incompleto.
      </p>
      {value.evaluaciones.map((entry, index) => (
        <fieldset
          key={index}
          disabled={disabled}
          className="evaluation-component"
        >
          <legend>Evaluación {index + 1}</legend>
          <div className="form-grid">
            <InputField
              label={`Nombre de evaluación ${index + 1}`}
              value={entry.nombre}
              maxLength={120}
              required
              error={
                attempted && !entry.nombre.trim()
                  ? "Indica el nombre."
                  : undefined
              }
              onChange={(event) =>
                update(index, { nombre: event.target.value })
              }
            />
            <SelectField
              label={`Unidad de evaluación ${index + 1}`}
              value={entry.unidadId ?? ""}
              onChange={(event) =>
                update(index, { unidadId: event.target.value || null })
              }
            >
              <option value="">Sin unidad específica</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id} disabled={!unit.activo}>
                  {unit.nombre}
                  {!unit.activo ? " (inactiva)" : ""}
                </option>
              ))}
            </SelectField>
            <InputField
              label={`Peso de evaluación ${index + 1} (%)`}
              value={entry.pesoPct}
              inputMode="decimal"
              required
              error={weightIssue(entry.pesoPct)}
              onChange={(event) =>
                update(index, { pesoPct: event.target.value })
              }
            />
            <InputField
              label={`Orden de evaluación ${index + 1}`}
              type="number"
              min={1}
              max={32767}
              value={entry.orden || ""}
              required
              error={orderIssue(entry.orden)}
              onChange={(event) =>
                update(index, { orden: Number(event.target.value) })
              }
            />
          </div>
          {entry.indicadores.map((indicator, at) => (
            <fieldset key={at} className="evaluation-indicator">
              <legend>
                Indicador {at + 1} de evaluación {index + 1}
              </legend>
              <div className="form-grid">
                <InputField
                  label={`Código de indicador ${at + 1} de evaluación ${index + 1}`}
                  value={indicator.codigo}
                  maxLength={20}
                  required
                  error={
                    attempted && !indicator.codigo.trim()
                      ? "Indica el código."
                      : undefined
                  }
                  onChange={(event) =>
                    update(index, {
                      indicadores: entry.indicadores.map((item, other) =>
                        other === at
                          ? { ...item, codigo: event.target.value }
                          : item,
                      ),
                    })
                  }
                />
                <InputField
                  label={`Descripción de indicador ${at + 1} de evaluación ${index + 1}`}
                  value={indicator.descripcion}
                  maxLength={250}
                  required
                  error={
                    attempted && !indicator.descripcion.trim()
                      ? "Indica la descripción."
                      : undefined
                  }
                  onChange={(event) =>
                    update(index, {
                      indicadores: entry.indicadores.map((item, other) =>
                        other === at
                          ? { ...item, descripcion: event.target.value }
                          : item,
                      ),
                    })
                  }
                />
                <InputField
                  label={`Peso de indicador ${at + 1} de evaluación ${index + 1} (%)`}
                  value={indicator.pesoPct}
                  inputMode="decimal"
                  required
                  error={weightIssue(indicator.pesoPct)}
                  onChange={(event) =>
                    update(index, {
                      indicadores: entry.indicadores.map((item, other) =>
                        other === at
                          ? { ...item, pesoPct: event.target.value }
                          : item,
                      ),
                    })
                  }
                />
                <InputField
                  label={`Orden de indicador ${at + 1} de evaluación ${index + 1}`}
                  type="number"
                  min={1}
                  max={32767}
                  value={indicator.orden || ""}
                  required
                  error={orderIssue(indicator.orden)}
                  onChange={(event) =>
                    update(index, {
                      indicadores: entry.indicadores.map((item, other) =>
                        other === at
                          ? { ...item, orden: Number(event.target.value) }
                          : item,
                      ),
                    })
                  }
                />
              </div>
              <Button
                onClick={() =>
                  update(index, {
                    indicadores: entry.indicadores.filter(
                      (_, other) => other !== at,
                    ),
                  })
                }
              >
                Quitar indicador {at + 1} de evaluación {index + 1}
              </Button>
            </fieldset>
          ))}
          <div className="actions">
            <Button
              disabled={
                entry.indicadores.length >= 30 || totalIndicators >= 100
              }
              onClick={() =>
                update(index, {
                  indicadores: [
                    ...entry.indicadores,
                    {
                      codigo: "",
                      descripcion: "",
                      pesoPct: "",
                      orden:
                        Math.max(
                          0,
                          ...entry.indicadores.map((item) => item.orden),
                        ) + 1,
                    },
                  ],
                })
              }
            >
              Añadir indicador a evaluación {index + 1}
            </Button>
            <Button
              onClick={() =>
                onChange({
                  evaluaciones: value.evaluaciones.filter(
                    (_, other) => other !== index,
                  ),
                })
              }
            >
              Quitar evaluación {index + 1}
            </Button>
          </div>
        </fieldset>
      ))}
      <Button
        disabled={disabled || value.evaluaciones.length >= 20}
        onClick={() =>
          onChange({
            evaluaciones: [
              ...value.evaluaciones,
              {
                nombre: "",
                unidadId: null,
                pesoPct: "",
                orden:
                  Math.max(0, ...value.evaluaciones.map((item) => item.orden)) +
                  1,
                indicadores: [],
              },
            ],
          })
        }
      >
        Añadir evaluación
      </Button>
    </section>
  );
}

export function DefinitionView({
  value,
  units = [],
}: {
  value: EvaluationDefinition;
  units?: EvaluationUnit[];
}) {
  return (
    <section aria-label="Criterios registrados">
      {value.evaluaciones.length === 0 && (
        <p className="empty">Todavía no hay evaluaciones definidas.</p>
      )}
      {value.evaluaciones.map((entry) => (
        <section key={entry.orden} className="evaluation-component">
          <h3>
            {entry.orden}. {entry.nombre}
          </h3>
          <p>
            Peso en el nivel: {entry.pesoPct} % · Unidad:{" "}
            {units.find((unit) => unit.id === entry.unidadId)?.nombre ??
              (entry.unidadId ? `#${entry.unidadId}` : "Sin unidad específica")}
          </p>
          <DataTable
            caption={`Indicadores de ${entry.nombre}`}
            rows={entry.indicadores}
            rowKey={(row) => row.orden}
            emptyMessage="Sin indicadores."
            columns={[
              { key: "orden", header: "Orden", cell: (row) => row.orden },
              { key: "codigo", header: "Código", cell: (row) => row.codigo },
              {
                key: "descripcion",
                header: "Descripción",
                cell: (row) => row.descripcion,
              },
              {
                key: "peso",
                header: "Peso en la evaluación",
                cell: (row) => `${row.pesoPct} %`,
              },
            ]}
          />
        </section>
      ))}
    </section>
  );
}
