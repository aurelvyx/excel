import { BadRequestException } from '@nestjs/common';
export function queryText(
  query: Record<string, unknown>,
  key: string,
  max: number,
  required = false,
) {
  const value = query[key];
  if (value === undefined && !required) return undefined;
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new BadRequestException(`Filtro ${key} inválido`);
  return value.trim();
}
/** Búsqueda literal: los caracteres % y _ de entrada no son comodines SQL. */
export const containsPattern = (value: string) =>
  `%${value.replace(/[\\%_]/g, '\\$&')}%`;
