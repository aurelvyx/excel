import { runtimeRoleEnvironment } from './runtime-role.js';

const valid = {
  APP_DB_USER: 'excel_app',
  APP_DB_PASSWORD: 'a'.repeat(64),
  DB_USER: 'excel_owner',
  DB_PASSWORD: 'b'.repeat(64),
};

describe('Credenciales del rol de ejecución B21', () => {
  it('separa credenciales de la API y del propietario', () => {
    expect(runtimeRoleEnvironment(valid)).toEqual({
      name: valid.APP_DB_USER,
      password: valid.APP_DB_PASSWORD,
    });
    expect(() =>
      runtimeRoleEnvironment({ ...valid, APP_DB_USER: valid.DB_USER }),
    ).toThrow('distintos');
    expect(() =>
      runtimeRoleEnvironment({ ...valid, APP_DB_PASSWORD: valid.DB_PASSWORD }),
    ).toThrow('distintas');
  });
  it.each([
    '',
    'postgres',
    'public',
    'pg_admin',
    'Excel',
    'a";DROP ROLE postgres;',
    'a'.repeat(64),
  ])('rechaza el identificador reservado o inválido %s', (name) => {
    expect(() =>
      runtimeRoleEnvironment({ ...valid, APP_DB_USER: name }),
    ).toThrow('APP_DB_USER');
  });
  it.each([
    '',
    'a'.repeat(31),
    'a'.repeat(257),
    `${'a'.repeat(32)}\n`,
    `${'a'.repeat(32)}\0`,
  ])('rechaza una contraseña inválida %#', (password) => {
    expect(() =>
      runtimeRoleEnvironment({ ...valid, APP_DB_PASSWORD: password }),
    ).toThrow('APP_DB_PASSWORD');
  });
});
