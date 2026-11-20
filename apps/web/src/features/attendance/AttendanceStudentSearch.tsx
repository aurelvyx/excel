import { InputField } from "../../shared/ui/Field";

export function AttendanceStudentSearch({
  search,
  onSearch,
  visible,
  total,
  paginated = false,
}: {
  search: string;
  onSearch: (value: string) => void;
  visible: number;
  total: number;
  paginated?: boolean;
}) {
  return (
    <div className="attendance-student-search">
      <InputField
        type="search"
        label={
          paginated ? "Buscar estudiante en esta página" : "Buscar estudiante"
        }
        placeholder="Nombre, documento o matrícula"
        value={search}
        onChange={(event) => onSearch(event.target.value)}
      />
      <span role="status">
        {visible} de {total} estudiantes
      </span>
    </div>
  );
}
