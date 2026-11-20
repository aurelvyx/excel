import type ExcelJS from 'exceljs';
import { actSheetLayout } from './report-acta.js';

type SheetCellStyle = {
  color?: string;
  backgroundColor?: string;
  fontFamily?: 'Arial' | 'Arial Narrow';
  fontSize?: number;
  fontWeight?: number;
  fontStyle?: 'italic';
  textDecoration?: 'underline';
  textAlign?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  rotate?: boolean;
  borderTop?: string;
  borderRight?: string;
  borderBottom?: string;
  borderLeft?: string;
};

type SheetCell = {
  column: number;
  rowSpan: number;
  colSpan: number;
  text: string;
  style: SheetCellStyle;
};

type SheetImage = {
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ActSheetPreview = {
  headerRows: number;
  columnWidths: number[];
  rows: { index: number; height: number; cells: SheetCell[] }[];
  images: SheetImage[];
};

type ActColor = Partial<ExcelJS.Color> & { tint?: number; indexed?: number };
type MergedSpan = { rowSpan: number; colSpan: number };

const { columns, headerRows, rosterRows, footerRows } = actSheetLayout;
const pointsToPixels = 4 / 3;
const emuPerPixel = 9_525;
const digitWidth = 7; // Ancho del dígito en la fuente base de las plantillas.

function colorHex(color: ActColor | undefined) {
  const argb = color?.argb?.slice(-6);
  const rgb =
    argb && /^[\da-f]{6}$/i.test(argb)
      ? argb
      : color?.theme === 0
        ? 'ffffff'
        : color?.theme === 1 || color?.indexed === 64
          ? '000000'
          : undefined;
  if (!rgb || !color?.tint) return rgb && `#${rgb}`;
  // Los tonos del acta se aplican sobre colores neutros del tema.
  const tone = Math.max(-1, Math.min(1, color.tint));
  const tinted = rgb.match(/../g)!.map((part) => {
    const channel = Number.parseInt(part, 16);
    return Math.round(
      tone < 0 ? channel * (1 + tone) : channel + (255 - channel) * tone,
    )
      .toString(16)
      .padStart(2, '0');
  });
  return `#${tinted.join('')}`;
}

function line(border: Partial<ExcelJS.Border> | undefined) {
  const style = border?.style;
  if (!style) return undefined;
  const color = colorHex(border.color) ?? '#000000';
  if (style === 'double') return `3px double ${color}`;
  if (style === 'dotted') return `1px dotted ${color}`;
  if (style === 'dashed') return `1px dashed ${color}`;
  const width = style === 'thick' ? 3 : style === 'medium' ? 2 : 1;
  return `${width}px solid ${color}`;
}

function sheetCellStyle(
  cell: ExcelJS.Cell,
  bottomRight: ExcelJS.Cell,
): SheetCellStyle {
  const { alignment, border, fill, font } = cell;
  const { horizontal, vertical, textRotation } = alignment ?? {};
  const fontName = font?.name;
  return {
    color: colorHex(font?.color),
    backgroundColor:
      fill?.type === 'pattern' && fill.pattern === 'solid'
        ? colorHex(fill.fgColor)
        : undefined,
    fontFamily:
      fontName === 'Arial' || fontName === 'Arial Narrow'
        ? fontName
        : undefined,
    fontSize: font?.size ? font.size * pointsToPixels : undefined,
    fontWeight: font?.bold ? 700 : undefined,
    fontStyle: font?.italic ? 'italic' : undefined,
    textDecoration:
      font?.underline && font.underline !== 'none' ? 'underline' : undefined,
    textAlign:
      horizontal === 'center' || horizontal === 'left' || horizontal === 'right'
        ? horizontal
        : typeof cell.value === 'number' || cell.value instanceof Date
          ? 'right'
          : undefined,
    verticalAlign:
      vertical === 'top' || vertical === 'middle' || vertical === 'bottom'
        ? vertical
        : undefined,
    rotate: textRotation === 90 || textRotation === 'vertical' || undefined,
    borderTop: line(border?.top),
    borderLeft: line(border?.left),
    borderRight: line(bottomRight.border?.right ?? border?.right),
    borderBottom: line(bottomRight.border?.bottom ?? border?.bottom),
  };
}

function displayText(cell: ExcelJS.Cell) {
  const { value, numFmt } = cell;
  if (value instanceof Date && numFmt === 'dd/mm/yyyy') {
    const [year, month, day] = value.toISOString().slice(0, 10).split('-');
    return `${day}/${month}/${year}`;
  }
  if (typeof value === 'number') {
    // Los formatos del acta usan 0 como dígito fijo y # como opcional.
    const digits = /^0(?:\.(0+)(#*))?$/.exec(numFmt ?? '');
    if (digits) {
      const minimumFractionDigits = digits[1]?.length ?? 0;
      return value.toLocaleString('es-PE', {
        useGrouping: false,
        minimumFractionDigits,
        maximumFractionDigits: minimumFractionDigits + (digits[2]?.length ?? 0),
      });
    }
  }
  return cell.text;
}

function mergedSpans(sheet: ExcelJS.Worksheet) {
  const result = new Map<string, MergedSpan>();
  for (const merge of sheet.model.merges) {
    const [start, end] = merge.split(':');
    const first = sheet.getCell(start);
    const last = sheet.getCell(end);
    result.set(first.address, {
      rowSpan: Number(last.row) - Number(first.row) + 1,
      colSpan: Number(last.col) - Number(first.col) + 1,
    });
  }
  return result;
}

function sheetImages(
  book: ExcelJS.Workbook,
  sheet: ExcelJS.Worksheet,
  columnWidths: number[],
  rowHeight: (index: number) => number,
) {
  const result: SheetImage[] = [];
  const headerHeights = Array.from({ length: headerRows }, (_, position) =>
    rowHeight(position + 1),
  );
  function point(anchor: ExcelJS.Anchor) {
    return {
      x:
        columnWidths
          .slice(0, anchor.nativeCol)
          .reduce((sum, size) => sum + size, 0) +
        anchor.nativeColOff / emuPerPixel,
      y:
        headerHeights
          .slice(0, anchor.nativeRow)
          .reduce((sum, size) => sum + size, 0) +
        anchor.nativeRowOff / emuPerPixel,
    };
  }
  for (const { imageId, range } of sheet.getImages()) {
    const media = book.getImage(Number(imageId));
    const { tl, br } = range;
    if (
      !media?.buffer ||
      (media.extension !== 'png' && media.extension !== 'jpeg') ||
      !tl ||
      tl.nativeRow >= headerRows
    )
      continue;
    const top = point(tl);
    const bottom = br && br.nativeRow <= headerRows ? point(br) : undefined;
    // ExcelJS devuelve posiciones de un anclaje de una celda, aunque su tipo
    // getImages solo declara el anclaje de dos celdas.
    const { ext } = range as ExcelJS.ImageRange &
      Partial<ExcelJS.ImagePosition>;
    const width = bottom ? bottom.x - top.x : (ext?.width ?? 0);
    const height = bottom ? bottom.y - top.y : (ext?.height ?? 0);
    if (width > 0 && height > 0) {
      const content = Buffer.from(media.buffer).toString('base64');
      result.push({
        src: `data:image/${media.extension};base64,${content}`,
        ...top,
        width,
        height,
      });
    }
  }
  return result;
}

/** Proyecta el acta ya poblada. Omite las líneas vacías del padrón impreso. */
export function buildActPreview(
  book: ExcelJS.Workbook,
  sheet: ExcelJS.Worksheet,
  rosterCount: number,
): ActSheetPreview {
  const columnWidths = Array.from({ length: columns }, (_, position) => {
    const width =
      sheet.getColumn(position + 1).width ??
      sheet.properties.defaultColWidth ??
      9.14;
    return Math.trunc(
      ((256 * width + Math.trunc(128 / digitWidth)) / 256) * digitWidth,
    );
  });
  const rowHeight = (index: number) =>
    (sheet.getRow(index).height ?? sheet.properties.defaultRowHeight) *
    pointsToPixels;
  const firstFooterRow = headerRows + Math.max(rosterRows, rosterCount) + 1;
  const rowIndices = [
    ...Array.from(
      { length: headerRows + rosterCount },
      (_, position) => position + 1,
    ),
    ...Array.from(
      { length: footerRows },
      (_, position) => firstFooterRow + position,
    ),
  ];
  const spans = mergedSpans(sheet);
  const rows = rowIndices.map((index) => {
    const cells: SheetCell[] = [];
    for (let column = 1; column <= columns; column++) {
      const cell = sheet.getCell(index, column);
      if (cell.isMerged && cell.master.address !== cell.address) continue;
      const { rowSpan, colSpan } = spans.get(cell.address) ?? {
        rowSpan: 1,
        colSpan: 1,
      };
      cells.push({
        column,
        rowSpan,
        colSpan,
        text: displayText(cell),
        style: sheetCellStyle(
          cell,
          sheet.getCell(index + rowSpan - 1, column + colSpan - 1),
        ),
      });
    }
    return { index, height: rowHeight(index), cells };
  });
  return {
    headerRows,
    columnWidths,
    rows,
    images: sheetImages(book, sheet, columnWidths, rowHeight),
  };
}
