import { Button } from "./Button";

export function Pagination({
  after,
  nextCursor,
  onChange,
  count,
  firstLabel = "Primera página",
  nextLabel = "Siguiente",
}: {
  after?: string | null;
  nextCursor: string | null;
  onChange: (cursor: string) => void;
  count?: number;
  firstLabel?: string;
  nextLabel?: string;
}) {
  if (count === undefined && !after && !nextCursor) return null;
  return (
    <footer className="pagination">
      {count !== undefined && <span>{count} registros en esta página</span>}
      <div>
        <Button disabled={!after} onClick={() => onChange("")}>
          {firstLabel}
        </Button>
        <Button
          disabled={!nextCursor}
          onClick={() => {
            if (nextCursor) onChange(nextCursor);
          }}
        >
          {nextLabel}
        </Button>
      </div>
    </footer>
  );
}
