import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    let status = 500;
    let message: unknown = 'Error interno del servidor';
    if (error instanceof HttpException) {
      status = error.getStatus();
      const body = error.getResponse();
      message =
        typeof body === 'string'
          ? body
          : (body as { message?: unknown }).message || 'Solicitud rechazada';
    } else {
      const code = (error as { driverError?: { code?: string } })?.driverError
        ?.code;
      if (code === '23505') {
        status = 409;
        message = 'El registro ya existe';
      }
      if (code === '23503' || code === '23514' || code === '23001') {
        status = 400;
        message = 'Los datos no cumplen las restricciones';
      }
    }
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(status)
      .json({ statusCode: status, message });
  }
}
