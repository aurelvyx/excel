import type { DataSource, MigrationInterface } from 'typeorm';

/** Comprueba una reversión concreta sin depender de cuál sea la última migración. */
export async function checkMigrationReversal(
  source: DataSource,
  migration: MigrationInterface,
): Promise<void> {
  const runner = source.createQueryRunner();
  try {
    await runner.startTransaction();
    await migration.down(runner);
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
  }
}
