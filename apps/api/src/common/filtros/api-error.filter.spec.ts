import {
  type ArgumentsHost,
  BadRequestException,
  HttpException,
} from '@nestjs/common';
import { ApiErrorFilter } from './api-error.filter.js';

type ErrorBody = { statusCode: number; message: unknown };

function responseFor(error: unknown) {
  const json = vi.fn((_body: ErrorBody) => undefined);
  const status = vi.fn((_code: number) => ({ json }));
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as ArgumentsHost;
  new ApiErrorFilter().catch(error, host);
  return { status, json, body: json.mock.calls[0]![0] };
}

describe('Errores HTTP consistentes sin diagnósticos privados de PostgreSQL', () => {
  it.each([
    [
      '40001',
      409,
      'Los datos cambiaron durante la operación. Recarga antes de volver a confirmar',
    ],
    [
      '40P01',
      409,
      'Los datos cambiaron durante la operación. Recarga antes de volver a confirmar',
    ],
    ['23505', 409, 'El registro ya existe'],
    ['23514', 400, 'Los datos no cumplen las restricciones'],
    ['23503', 400, 'Los datos no cumplen las restricciones'],
    ['23001', 400, 'Los datos no cumplen las restricciones'],
    ['XX000', 500, 'Error interno del servidor'],
  ])(
    'traduce driverError %s a %i sin SQL ni credenciales',
    (code, expectedStatus, message) => {
      const error = {
        query: 'SELECT password_hash FROM usuarios WHERE nombre_usuario=$1',
        parameters: ['never-expose-this'],
        message: 'password=never-expose-this; servidor privado',
        driverError: {
          code,
          detail: 'password=never-expose-this',
          constraint: 'restriccion_interna_privada',
          table: 'usuarios',
        },
      };
      const response = responseFor(error);
      expect(response.status).toHaveBeenCalledExactlyOnceWith(expectedStatus);
      expect(response.json).toHaveBeenCalledExactlyOnceWith({
        statusCode: expectedStatus,
        message,
      });
      const serialized = JSON.stringify(response.body);
      for (const privateValue of [
        'SELECT',
        'password_hash',
        'never-expose-this',
        'restriccion_interna_privada',
        'driverError',
      ])
        expect(serialized).not.toContain(privateValue);
    },
  );

  it('un error desconocido sin driverError sigue siendo 500 y no expone su mensaje', () => {
    const response = responseFor(new Error('password=never-expose-this'));
    expect(response.status).toHaveBeenCalledExactlyOnceWith(500);
    expect(response.body).toEqual({
      statusCode: 500,
      message: 'Error interno del servidor',
    });
  });

  it('conserva el estado y mensaje explícitos de una excepción HTTP', () => {
    const response = responseFor(new HttpException('Solicitud inválida', 422));
    expect(response.status).toHaveBeenCalledExactlyOnceWith(422);
    expect(response.body).toEqual({
      statusCode: 422,
      message: 'Solicitud inválida',
    });
  });

  it('conserva los errores asociados a campos inválidos del DTO', () => {
    const messages = ['motivo es obligatorio', 'version debe ser un entero'];
    const response = responseFor(new BadRequestException(messages));
    expect(response.status).toHaveBeenCalledExactlyOnceWith(400);
    expect(response.body).toEqual({ statusCode: 400, message: messages });
  });
});
