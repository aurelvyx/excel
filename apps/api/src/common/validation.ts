import {
  applyDecorators,
  BadRequestException,
  type Type,
  ValidationPipe,
} from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches, ValidateIf } from 'class-validator';

export const TextField = (max: number) =>
  applyDecorators(
    ApiProperty({ type: String, maxLength: max }),
    IsString(),
    Length(1, max),
    Matches(/\S/),
  );
export const IdField = () =>
  applyDecorators(
    ApiProperty({ type: String, pattern: '^[1-9][0-9]{0,17}$' }),
    IsString(),
    Matches(/^[1-9][0-9]{0,17}$/),
  );
export const OptionalField = () =>
  ValidateIf((_object, value) => value !== undefined);
export const NullableField = () =>
  ValidateIf((_object, value) => value !== undefined && value !== null);
export const inputDto = (expectedType: Type<object>) =>
  new ValidationPipe({
    expectedType,
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
export function validId(value: string): string {
  if (!/^[1-9][0-9]{0,17}$/.test(value))
    throw new BadRequestException('Identificador inválido');
  return value;
}
export function page(query: Record<string, unknown>, extra: string[] = []) {
  if (
    Object.keys(query).some(
      (key) => !['after', 'limit', ...extra].includes(key),
    )
  )
    throw new BadRequestException('Filtro no permitido');
  const after = query.after ?? '0';
  const limit = query.limit ?? '50';
  if (
    typeof after !== 'string' ||
    !/^(0|[1-9][0-9]{0,17})$/.test(after) ||
    typeof limit !== 'string' ||
    !/^\d{1,3}$/.test(limit) ||
    Number(limit) < 1 ||
    Number(limit) > 100
  ) {
    throw new BadRequestException('Paginación inválida');
  }
  return { after, limit: Number(limit) };
}
