import { Plus, Trash2, Layers, Target } from "lucide-react";
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
  const totalEvalWeight = value.evaluaciones.reduce(
    (sum, entry) => sum + (Number(entry.pesoPct) || 0),
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
      style={{ marginTop: "1rem" }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.5rem",
          marginBottom: "0.75rem",
        }}
      >
        <div>
          <h2 style={{ fontSize: "1rem", fontWeight: 800, color: "#1e293b", margin: 0 }}>
            Evaluaciones e indicadores de logro
          </h2>
          <p className="help" style={{ margin: "0.2rem 0 0 0" }}>
            Para aprobar la versión, las evaluaciones deben sumar <strong>100%</strong> y los indicadores dentro de cada evaluación también <strong>100%</strong>.
          </p>
        </div>

        <span
          className={`academic-badge ${
            Math.abs(totalEvalWeight - 100) < 0.01 ? "badge-green" : "badge-amber"
          }`}
          style={{ fontSize: "0.75rem" }}
        >
          Suma de Evaluaciones: {Math.round(totalEvalWeight * 100) / 100}% / 100%
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "1rem" }}>
        {value.evaluaciones.map((entry, index) => {
          const indWeightSum = entry.indicadores.reduce(
            (s, ind) => s + (Number(ind.pesoPct) || 0),
            0,
          );
          return (
            <fieldset
              key={index}
              disabled={disabled}
              className="evaluation-component"
              style={{
                border: "1px solid #cbd5e1",
                borderLeft: "4px solid #007a3d",
                borderRadius: "0.75rem",
                padding: "1rem 1.25rem",
                backgroundColor: "#ffffff",
                margin: 0,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                  marginBottom: "0.75rem",
                  paddingBottom: "0.6rem",
                  borderBottom: "1px solid #f1f5f9",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <Layers size={16} color="#007a3d" />
                  <strong style={{ fontSize: "0.925rem", color: "#0f172a" }}>
                    Evaluación {index + 1} {entry.nombre ? `· ${entry.nombre}` : ""}
                  </strong>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span
                    className={`academic-badge ${
                      Math.abs(indWeightSum - 100) < 0.01 ? "badge-green" : "badge-gray"
                    }`}
                  >
                    Indicadores: {Math.round(indWeightSum * 100) / 100}% / 100%
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onChange({
                        evaluaciones: value.evaluaciones.filter(
                          (_, other) => other !== index,
                        ),
                      })
                    }
                    className="academic-btn-action btn-action-secondary"
                    style={{
                      padding: "0.25rem 0.6rem",
                      fontSize: "0.72rem",
                      color: "#b91c1c",
                      borderColor: "#fecaca",
                    }}
                  >
                    <Trash2 size={12} /> Quitar evaluación
                  </button>
                </div>
              </div>

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
                  label={`Unidad Didáctica vinculada`}
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
                  label={`Peso en el nivel (%)`}
                  value={entry.pesoPct}
                  inputMode="decimal"
                  required
                  error={weightIssue(entry.pesoPct)}
                  onChange={(event) =>
                    update(index, { pesoPct: event.target.value })
                  }
                />
                <InputField
                  label={`Orden`}
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

              {/* Indicadores de la Evaluación */}
              <div
                style={{
                  marginTop: "0.85rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.65rem",
                }}
              >
                {entry.indicadores.map((indicator, at) => (
                  <fieldset
                    key={at}
                    className="evaluation-indicator"
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: "0.6rem",
                      padding: "0.75rem 0.9rem",
                      backgroundColor: "#f8fafc",
                      margin: 0,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "0.5rem",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          color: "#334155",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.35rem",
                        }}
                      >
                        <Target size={13} color="#2563eb" />
                        Indicador {at + 1} de Evaluación {index + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          update(index, {
                            indicadores: entry.indicadores.filter(
                              (_, other) => other !== at,
                            ),
                          })
                        }
                        style={{
                          background: "none",
                          border: "none",
                          color: "#dc2626",
                          fontSize: "0.72rem",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        ✕ Quitar indicador
                      </button>
                    </div>

                    <div className="form-grid">
                      <InputField
                        label={`Código (ej. I1, EX, PR)`}
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
                        label={`Descripción del indicador`}
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
                        label={`Peso en evaluación (%)`}
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
                        label={`Orden`}
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
                  </fieldset>
                ))}
              </div>

              <div className="actions" style={{ marginTop: "0.75rem" }}>
                <Button
                  disabled={
                    entry.indicadores.length >= 30 || totalIndicators >= 100
                  }
                  onClick={() =>
                    update(index, {
                      indicadores: [
                        ...entry.indicadores,
                        {
                          codigo: `I${entry.indicadores.length + 1}`,
                          descripcion: "",
                          pesoPct: entry.indicadores.length === 0 ? "100" : "",
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
                  <Plus size={13} /> Añadir indicador a evaluación {index + 1}
                </Button>
              </div>
            </fieldset>
          );
        })}
      </div>

      <Button
        disabled={disabled || value.evaluaciones.length >= 20}
        onClick={() =>
          onChange({
            evaluaciones: [
              ...value.evaluaciones,
              {
                nombre: "",
                unidadId: units[value.evaluaciones.length]?.id ?? null,
                pesoPct: value.evaluaciones.length === 0 ? "100" : "",
                orden:
                  Math.max(0, ...value.evaluaciones.map((item) => item.orden)) +
                  1,
                indicadores: [
                  {
                    codigo: "I1",
                    descripcion: "",
                    pesoPct: "100",
                    orden: 1,
                  },
                ],
              },
            ],
          })
        }
      >
        <Plus size={14} /> Añadir evaluación / unidad
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
    <section aria-label="Criterios registrados" style={{ display: "flex", flexDirection: "column", gap: "0.85rem", marginTop: "0.75rem" }}>
      {value.evaluaciones.length === 0 && (
        <p className="empty">Todavía no hay evaluaciones definidas.</p>
      )}
      {value.evaluaciones.map((entry) => (
        <section
          key={entry.orden}
          className="evaluation-component"
          style={{
            border: "1px solid #e2e8f0",
            borderLeft: "4px solid #007a3d",
            borderRadius: "0.75rem",
            padding: "1rem 1.25rem",
            backgroundColor: "#ffffff",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <h3 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 800, color: "#0f172a" }}>
              {entry.orden}. {entry.nombre}
            </h3>
            <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
              <span className="academic-badge badge-blue">
                Unidad:{" "}
                {units.find((unit) => unit.id === entry.unidadId)?.nombre ??
                  (entry.unidadId ? `#${entry.unidadId}` : "Sin unidad específica")}
              </span>
              <span className="academic-badge badge-green">
                Peso en el nivel: {entry.pesoPct}%
              </span>
            </div>
          </div>
          <DataTable
            caption={`Indicadores de ${entry.nombre}`}
            rows={entry.indicadores}
            rowKey={(row) => row.orden}
            emptyMessage="Sin indicadores."
            columns={[
              { key: "orden", header: "Orden", cell: (row) => row.orden },
              { key: "codigo", header: "Código", cell: (row) => <strong>{row.codigo}</strong> },
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
