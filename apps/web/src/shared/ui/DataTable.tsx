import type { Key, ReactNode } from "react";

export type Column<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
};
export function DataTable<T>({
  caption,
  rows,
  columns,
  rowKey,
  emptyMessage,
}: {
  caption: string;
  rows: readonly T[];
  columns: readonly Column<T>[];
  rowKey: (row: T) => Key;
  emptyMessage?: ReactNode;
}) {
  return (
    <>
      <div
        className="table-scroll"
        tabIndex={0}
        role="region"
        aria-label={`Tabla de ${caption.toLowerCase()}`}
      >
        <table>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th scope="col" key={column.key}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((column) => (
                  <td key={column.key} className={column.className}>
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && emptyMessage && (
        <p className="empty">{emptyMessage}</p>
      )}
    </>
  );
}
