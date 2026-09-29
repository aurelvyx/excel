import { useId, type ComponentProps, type ReactNode } from "react";

type FieldProps = {
  id?: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  fieldClassName?: string;
};
type Control = {
  id: string;
  "aria-invalid": boolean;
  "aria-describedby": string | undefined;
};
function FieldFrame({
  id: providedId,
  label,
  hint,
  error,
  required,
  fieldClassName,
  children,
}: FieldProps & { children: (control: Control) => ReactNode }) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const describedBy =
    [hint ? `${id}-hint` : "", error ? `${id}-error` : ""]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div className={fieldClassName ?? "field"}>
      <label htmlFor={id}>
        {label}
        {required && <span aria-hidden="true" className="required-marker" />}
      </label>
      {children({
        id,
        "aria-invalid": !!error,
        "aria-describedby": describedBy,
      })}
      {hint && (
        <small id={`${id}-hint`} className="help">
          {hint}
        </small>
      )}
      {error && (
        <small id={`${id}-error`} className="field-error">
          {error}
        </small>
      )}
    </div>
  );
}
type InputProps = Omit<
  ComponentProps<"input">,
  "id" | "aria-invalid" | "aria-describedby"
> &
  FieldProps & { endAdornment?: ReactNode };
export function InputField({
  id,
  label,
  hint,
  error,
  required,
  fieldClassName,
  endAdornment,
  ...props
}: InputProps) {
  return (
    <FieldFrame {...{ id, label, hint, error, required, fieldClassName }}>
      {(control) =>
        endAdornment ? (
          <div className="password-input">
            <input {...props} {...control} required={required} />
            {endAdornment}
          </div>
        ) : (
          <input {...props} {...control} required={required} />
        )
      }
    </FieldFrame>
  );
}
type SelectProps = Omit<
  ComponentProps<"select">,
  "id" | "aria-invalid" | "aria-describedby"
> &
  FieldProps;
export function SelectField({
  id,
  label,
  hint,
  error,
  required,
  fieldClassName,
  ...props
}: SelectProps) {
  return (
    <FieldFrame {...{ id, label, hint, error, required, fieldClassName }}>
      {(control) => <select {...props} {...control} required={required} />}
    </FieldFrame>
  );
}
