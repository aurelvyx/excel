import { SetMetadata } from '@nestjs/common';
import type { Request } from 'express';

export const ROLE_CODES = [
  'ADMIN',
  'SECRETARIA',
  'DOCENTE',
  'COORDINADOR',
] as const;
export type Role = (typeof ROLE_CODES)[number];
export const ACCESS = 'excel:access';
export const Access = (...roles: Role[]) =>
  SetMetadata(ACCESS, { roles, public: false, temporary: false });
export const Public = () => SetMetadata(ACCESS, { public: true });
export const SessionOnly = () =>
  SetMetadata(ACCESS, { roles: [], public: false, temporary: true });
export type Policy = { public?: boolean; roles?: Role[]; temporary?: boolean };
export type Identity = {
  id: string;
  nombre_usuario: string;
  roles: Role[];
  requiere_cambio_clave: boolean;
  sessionId: string;
};
export type AuthRequest = Request & {
  identity: Identity;
  sessionToken: string;
};
