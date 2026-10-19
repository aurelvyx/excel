export type Field = {
  key: string;
  label: string;
  source?: string;
  type?:
    | "text"
    | "number"
    | "date"
    | "time"
    | "email"
    | "password"
    | "select"
    | "roles";
  required?: boolean;
  max?: number;
  min?: number;
  pattern?: string;
  options?: string[];
  reference?: string;
  immutable?: boolean;
  nullable?: boolean;
  createOnly?: boolean;
  editOnly?: boolean;
  hint?: string;
};
export type Resource = {
  key: string;
  title: string;
  singular: string;
  path: string;
  description: string;
  fields: Field[];
  columns: string[];
  filters?: Field[];
};
