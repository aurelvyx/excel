import { createDataSource } from './configuracion/data-source.js';
import { loadEnvironment } from './configuracion/environment.js';

loadEnvironment();
const action = process.argv[2];
if (!['run', 'revert', 'show'].includes(action ?? '')) {
  throw new Error('Uso: migrate.js run|revert|show');
}
if (action === 'revert' && process.env.NODE_ENV === 'production') {
  throw new Error('La reversión automática está deshabilitada en producción');
}
const source = createDataSource();
try {
  await source.initialize();
  if (action === 'run') {
    const applied = await source.runMigrations({ transaction: 'all' });
    console.log(`Migraciones aplicadas: ${applied.map((m) => m.name).join(', ') || 'ninguna'}`);
  } else if (action === 'revert') {
    await source.undoLastMigration({ transaction: 'all' });
    console.log('Última migración revertida');
  } else {
    console.log((await source.showMigrations()) ? 'Hay migraciones pendientes' : 'Migraciones al día');
  }
} finally {
  if (source.isInitialized) await source.destroy();
}
