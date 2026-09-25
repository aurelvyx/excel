import { databaseEnvironment } from './environment.js';
import { databaseOptions } from './data-source.js';

const valid = { DB_HOST: '127.0.0.1', DB_NAME: 'test', DB_USER: 'test', DB_PASSWORD: 'synthetic' };

describe('Configuración de persistencia', () => {
  it.each(['DB_HOST','DB_NAME','DB_USER','DB_PASSWORD'])('rechaza %s ausente', (key) => {
    expect(() => databaseEnvironment({ ...valid, [key]: '' })).toThrow(key);
  });
  it.each(['0','-1','abc','65536','1.5',''])('rechaza puerto inválido %s', (port) => {
    expect(() => databaseEnvironment({ ...valid, DB_PORT: port })).toThrow('DB_PORT');
  });
  it('no sincroniza ni migra implícitamente al arrancar', () => {
    const options = databaseOptions(valid);
    expect(options.synchronize).toBe(false);
    expect(options.migrationsRun).toBe(false);
    expect(options.migrationsTransactionMode).toBe('all');
  });
  it('valida TLS y mantiene la verificación de certificados', () => {
    expect(databaseEnvironment({ ...valid, DB_SSL: 'true' }).ssl).toEqual({ rejectUnauthorized: true });
    expect(() => databaseEnvironment({ ...valid, DB_SSL: 'yes' })).toThrow('DB_SSL');
  });
});
