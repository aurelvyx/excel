import { InputField, SelectField } from "../../shared/ui/Field";
import { DefinitionEditor } from "./EvaluationDefinition";
import {
  evaluationFormula,
  formulaLabel,
  type EvaluationDefinition,
  type EvaluationUnit,
} from "./model";

export function PlanFields({
  name,
  formula,
  definition,
  units,
  disabled,
  attempted,
  setName,
  setFormula,
  setDefinition,
}: {
  name: string;
  formula: string;
  definition: EvaluationDefinition;
  units: EvaluationUnit[];
  disabled: boolean;
  attempted: boolean;
  setName: (value: string) => void;
  setFormula: (value: string) => void;
  setDefinition: (value: EvaluationDefinition) => void;
}) {
  return (
    <>
      <InputField
        label="Nombre de la versión"
        value={name}
        maxLength={120}
        required
        disabled={disabled}
        error={
          attempted && !name.trim()
            ? "Indica el nombre de la versión."
            : undefined
        }
        onChange={(event) => setName(event.target.value)}
      />
      <SelectField
        label="Fórmula de evaluación"
        value={formula}
        required
        disabled={disabled}
        error={attempted && !formula ? "Selecciona una fórmula." : undefined}
        onChange={(event) => setFormula(event.target.value)}
      >
        <option value="">Selecciona la fórmula acordada</option>
        <option value={evaluationFormula}>{formulaLabel}</option>
      </SelectField>
      <DefinitionEditor
        value={definition}
        units={units}
        disabled={disabled}
        attempted={attempted}
        onChange={setDefinition}
      />
    </>
  );
}
