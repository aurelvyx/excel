import { ConflictException } from '@nestjs/common';
import { pathToFileURL } from 'node:url';
import { validateSync } from 'class-validator';
import type { DataSource } from 'typeorm';
import { createDataSource } from './configuracion/data-source.js';
import { loadEnvironment } from './configuracion/environment.js';
import { AuditService } from '../modules/control/audit.service.js';
import { CreateUserDto } from '../modules/usuarios/users.dto.js';
import { hashPassword } from '../modules/auth/security.js';

export async function bootstrapAdministrator(
  source: DataSource,
  name: string,
  password: string,
) {
  const dto = Object.assign(new CreateUserDto(), {
    nombreUsuario: name,
    passwordTemporal: password,
    roles: ['ADMIN'],
  });
  if (validateSync(dto).length)
    throw new Error(
      'Nombre inválido o contraseña inicial fuera de 12–128 caracteres',
    );
  const encoded = await hashPassword(password);
  return source.transaction(async (manager) => {
    await manager.query('SELECT pg_advisory_xact_lock(20260924, 4)');
    const existing: unknown[] = await manager.query(`SELECT u.id FROM usuarios u
      JOIN usuario_roles ur ON ur.usuario_id=u.id JOIN roles r ON r.id=ur.rol_id
      WHERE u.activo AND r.activo AND r.codigo='ADMIN' LIMIT 1`);
    if (existing.length)
      throw new ConflictException(
        'Ya existe un administrador activo; utilice la gestión de usuarios',
      );
    const [role] = (await manager.query(
      "SELECT id FROM roles WHERE codigo='ADMIN' AND activo",
    )) as { id: number }[];
    if (!role)
      throw new Error(
        'Ejecute las migraciones antes de crear el administrador',
      );
    const [user] = (await manager.query(
      `INSERT INTO usuarios (nombre_usuario,password_hash,requiere_cambio_clave)
      VALUES ($1,$2,true) RETURNING id,nombre_usuario`,
      [name, encoded],
    )) as { id: string; nombre_usuario: string }[];
    await manager.query(
      'INSERT INTO usuario_roles (usuario_id,rol_id,asignado_por) VALUES ($1,$2,$1)',
      [user!.id, role.id],
    );
    await new AuditService(source).record(
      {
        usuarioId: user!.id,
        accion: 'BOOTSTRAP_ADMIN',
        entidad: 'usuarios',
        entidadId: user!.id,
        nuevo: {
          nombre_usuario: name,
          roles: ['ADMIN'],
          requiere_cambio_clave: true,
        },
      },
      manager,
    );
    return user!;
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  loadEnvironment();
  const name = process.env.BOOTSTRAP_ADMIN_USERNAME;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!name || !password)
    throw new Error(
      'Defina BOOTSTRAP_ADMIN_USERNAME y BOOTSTRAP_ADMIN_PASSWORD para esta ejecución',
    );
  const source = createDataSource();
  try {
    await source.initialize();
    const user = await bootstrapAdministrator(source, name, password);
    console.log(
      `Administrador creado (ID ${user.id}). Debe cambiar la contraseña al iniciar sesión.`,
    );
  } catch {
    // No imprimir errores SQL: sus parámetros podrían incluir el hash de la contraseña.
    console.error(
      'No se pudo crear el administrador: verifique las migraciones, los datos y que no exista otro activo.',
    );
    process.exitCode = 1;
  } finally {
    if (source.isInitialized) await source.destroy();
  }
}
