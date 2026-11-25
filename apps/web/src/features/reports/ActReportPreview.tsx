import { useEffect, useRef, useState } from "react";
import { Button } from "../../shared/ui/Button";
import type { ActPreviewRow, ActPreviewSheet } from "./model";

function SheetRow({
  row,
  headerEnd,
}: {
  row: ActPreviewRow;
  headerEnd?: number;
}) {
  return (
    <tr data-index={row.index} style={{ height: row.height }}>
      {row.cells.map((cell) => {
        const { rotate, fontFamily, ...style } = cell.style;
        const columnHeader =
          row.index + cell.rowSpan - 1 === headerEnd && cell.text !== "";
        const Cell = columnHeader ? "th" : "td";
        return (
          <Cell
            key={cell.column}
            data-column={cell.column}
            rowSpan={cell.rowSpan}
            colSpan={cell.colSpan}
            scope={columnHeader ? "col" : undefined}
            style={{
              ...style,
              fontFamily:
                fontFamily === "Arial Narrow"
                  ? '"Arial Narrow", Arial, sans-serif'
                  : undefined,
            }}
          >
            {rotate ? (
              <span className="report-act-rotated">{cell.text}</span>
            ) : (
              cell.text
            )}
          </Cell>
        );
      })}
    </tr>
  );
}

export function ActReportPreview({ sheet }: { sheet: ActPreviewSheet }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [fitToWidth, setFitToWidth] = useState(true);
  const sheetWidth = sheet.columnWidths.reduce((sum, width) => sum + width, 0);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const updateWidth = () => setViewportWidth(element.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // En pantallas estrechas el área de la hoja desplaza el contenido y conserva
  // un tamaño de texto legible. En escritorio se puede ver la hoja de extremo a extremo.
  const minimumZoom = viewportWidth < 768 ? 0.6 : 0;
  const zoom =
    fitToWidth && viewportWidth > 0
      ? Math.min(1, Math.max(minimumZoom, viewportWidth / sheetWidth))
      : 1;

  return (
    <div className="report-act-preview">
      <div
        className="report-act-toolbar"
        role="group"
        aria-label="Tamaño de la hoja"
      >
        <Button
          variant={fitToWidth ? "primary" : "default"}
          aria-pressed={fitToWidth}
          onClick={() => {
            setFitToWidth(true);
            if (viewport.current) viewport.current.scrollLeft = 0;
          }}
        >
          Ajustar al ancho
        </Button>
        <Button
          variant={fitToWidth ? "default" : "primary"}
          aria-pressed={!fitToWidth}
          onClick={() => setFitToWidth(false)}
        >
          Tamaño real
        </Button>
      </div>
      <div
        className="report-act-scroll"
        aria-label="Hoja del acta de evaluación"
        role="region"
        tabIndex={0}
        ref={viewport}
      >
        <div className="report-act-sheet" style={{ width: sheetWidth, zoom }}>
          <table>
            <caption className="sr-only">
              Nómina del acta de evaluación de demostración
            </caption>
            <colgroup>
              {sheet.columnWidths.map((width, index) => (
                <col key={index} style={{ width }} />
              ))}
            </colgroup>
            <thead>
              {sheet.rows.slice(0, sheet.headerRows).map((row) => (
                <SheetRow
                  key={row.index}
                  row={row}
                  headerEnd={sheet.headerRows}
                />
              ))}
            </thead>
            <tbody>
              {sheet.rows.slice(sheet.headerRows).map((row) => (
                <SheetRow key={row.index} row={row} />
              ))}
            </tbody>
          </table>
          {sheet.images.map((image) => (
            <img
              key={`${image.x}:${image.y}`}
              src={image.src}
              alt=""
              draggable={false}
              style={{
                left: image.x,
                top: image.y,
                width: image.width,
                height: image.height,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
