import type { DataSource, EntityManager } from 'typeorm';

/** Los servicios comparten la transacción actual, incluidos sus savepoints. */
export function transactionalSource(
  source: DataSource,
  manager: EntityManager,
): DataSource {
  const scoped = Object.create(source) as DataSource;
  Object.defineProperty(scoped, 'manager', { value: manager });
  scoped.query = manager.query.bind(manager);
  return scoped;
}
