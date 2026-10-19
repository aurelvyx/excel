import { randomBytes, randomUUID } from "node:crypto";
import { open } from "node:fs/promises";
import {
  OperationError,
  archiveFile,
  archiveName,
  authorize,
  backupDirectory,
  command,
  configuration,
  connect,
  dockerClient,
  durableJson,
  fingerprint,
  image,
  readManifest,
  removePartial,
  sha256,
  snapshotEvidence,
} from "./core.mjs";

/** Cada estado es un evento nuevo; nunca se actualiza ni elimina la bitácora. */
async function record(client, operation, state, extra = {}) {
  await client.query("BEGIN");
  try {
    const { rows } = await client.query(
      `INSERT INTO respaldos
      (operacion_id,tipo,estado,ubicacion_logica,checksum,manifest_sha256,tamano_bytes,detalle,
       ejecutado_por,proceso_tecnico,iniciado_at,finalizado_at,respaldo_id,verificacion_completa)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id::text`,
      [
        operation.id,
        operation.type,
        state,
        operation.name ?? null,
        extra.hash ?? null,
        extra.manifestHash ?? null,
        extra.bytes ?? null,
        extra.detail ?? "Operación iniciada",
        operation.actor.adminId,
        operation.actor.serviceId,
        operation.startedAt,
        state === "INICIADO" ? null : new Date().toISOString(),
        operation.sourceId ?? null,
        extra.complete ?? false,
      ],
    );
    await client.query(
      `INSERT INTO auditoria_eventos(usuario_id,accion,entidad,entidad_id,valor_nuevo)
      VALUES($1,$2,'respaldos',$3,$4)`,
      [
        operation.actor.adminId,
        `${operation.type}_${state}`,
        rows[0].id,
        {
          operacion_id: operation.id,
          estado: state,
          ubicacion_logica: operation.name ?? null,
          proceso_tecnico: operation.actor.serviceId,
          verificacion_completa: extra.complete ?? false,
        },
      ],
    );
    await client.query("COMMIT");
    return rows[0].id;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}
async function lock(client) {
  const { rows } = await client.query(
    "SELECT pg_try_advisory_lock(20261018,21) AS obtenido",
  );
  if (!rows[0].obtenido)
    throw new OperationError(
      "Ya existe una operación de respaldo o verificación en esta base",
    );
  const version = await client.query(
    "SELECT current_setting('server_version_num')::int AS version",
  );
  if (version.rows[0].version < 180000 || version.rows[0].version >= 190000)
    throw new OperationError("El procedimiento requiere PostgreSQL 18");
}
async function failed(client, operation, phase) {
  await client.query("ROLLBACK").catch(() => {});
  try {
    await record(client, operation, "FALLIDO", {
      detail: `No se completó la operación (${phase}); revise el entorno operativo`,
    });
  } catch {
    throw new OperationError(
      "La operación falló y no se pudo guardar su resultado; revise el evento INICIADO y la conexión de origen",
    );
  }
}
function databaseCode(error) {
  return /^[0-9A-Z]{5}$/.test(error?.code ?? "")
    ? `; PostgreSQL ${error.code}`
    : "";
}

export async function backup(env = process.env, dependencies = {}) {
  const config = configuration(env);
  const directory = await backupDirectory(config.directory);
  const client = await (dependencies.connect ?? connect)(config);
  const run = dependencies.command ?? command;
  const operation = {
    id: randomUUID(),
    type: "RESPALDO",
    actor: config.actor,
    startedAt: new Date().toISOString(),
    name: archiveName(),
  };
  const file = archiveFile(directory, operation.name);
  let started = false;
  let completedFile = false;
  let ownedFile = false;
  let handle;
  let phase = "autenticación";
  try {
    await authorize(client, config.actor);
    phase = "bloqueo y versión";
    await lock(client);
    phase = "registro inicial";
    await record(client, operation, "INICIADO");
    started = true;
    phase = "snapshot";
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL timezone='UTC'");
    const { rows } = await client.query(
      "SELECT pg_export_snapshot() AS snapshot",
    );
    const evidence = await snapshotEvidence(client.query.bind(client));
    phase = "pg_dump";
    handle = await open(file, "wx", 0o600);
    ownedFile = true;
    const dump = await dockerClient(
      config,
      [
        "pg_dump",
        "--format=custom",
        "--no-owner",
        "--no-acl",
        "--no-password",
        `--snapshot=${rows[0].snapshot}`,
      ],
      { output: file, outputHandle: handle },
      run,
    );
    if (dump.warnings)
      throw new OperationError(
        "PostgreSQL comunicó advertencias; el respaldo requiere revisión",
      );
    await client.query("COMMIT");
    phase = "integridad";
    let info;
    await handle.sync();
    info = await handle.stat();
    await handle.close();
    handle = undefined;
    if (!info.size)
      throw new OperationError("pg_dump no produjo un archivo válido");
    const inspected = await dockerClient(
      config,
      ["pg_restore", "--list"],
      { input: file },
      run,
    );
    if (inspected.warnings)
      throw new OperationError(
        "El archivo no superó la inspección de PostgreSQL",
      );
    const hash = await sha256(file);
    const manifest = {
      version: 1,
      archivo: operation.name,
      formato: "PG_CUSTOM_18",
      sha256: hash,
      bytes: info.size,
      creadoAt: operation.startedAt,
      evidencia: evidence,
    };
    await durableJson(`${file}.json`, manifest);
    completedFile = true;
    const manifestHash = await sha256(`${file}.json`);
    phase = "registro final";
    const id = await record(client, operation, "EXITOSO", {
      hash,
      manifestHash,
      bytes: info.size,
      detail:
        "Archivo custom y manifiesto SHA256 generados; restauración aún no verificada",
    });
    return {
      id,
      archivo: operation.name,
      sha256: hash,
      bytes: info.size,
      restauracionVerificada: false,
    };
  } catch (error) {
    if (started) await failed(client, operation, phase);
    if (handle) {
      await handle.close().catch(() => {});
      handle = undefined;
    }
    if (!completedFile && ownedFile) await removePartial(file);
    if (error instanceof OperationError) throw error;
    throw new OperationError(`No se completó el respaldo (${phase}${databaseCode(error)})`);
  } finally {
    if (handle) await handle.close().catch(() => {});
    await client.end();
  }
}

/** Solo se restaura en un contenedor nuevo, sin red, puertos ni volúmenes del host. */
export async function verifyRestore(env = process.env, dependencies = {}) {
  if (env.RESTORE_CONFIRM !== "VERIFICAR_EN_CONTENEDOR_NUEVO")
    throw new OperationError(
      "Defina RESTORE_CONFIRM=VERIFICAR_EN_CONTENEDOR_NUEVO para confirmar el ensayo aislado",
    );
  const config = configuration(env);
  const directory = await backupDirectory(config.directory);
  const name = env.BACKUP_FILE;
  const { file, manifest, manifestHash } = await readManifest(directory, name);
  const client = await (dependencies.connect ?? connect)(config);
  const run = dependencies.command ?? command;
  const operation = {
    id: randomUUID(),
    type: "RESTAURACION",
    actor: config.actor,
    startedAt: new Date().toISOString(),
    name,
  };
  const container = `excel-restore-check-${randomUUID()}`;
  const password = randomBytes(32).toString("hex");
  const restoreEnv = { POSTGRES_PASSWORD: password, PGPASSWORD: password };
  let started = false;
  let created = false;
  let phase = "autorización";
  try {
    await authorize(client, config.actor);
    phase = "bloqueo y versión";
    await lock(client);
    phase = "respaldo registrado";
    const { rows } = await client.query(
      `SELECT id::text FROM respaldos WHERE tipo='RESPALDO' AND estado='EXITOSO'
      AND ubicacion_logica=$1 AND checksum=$2 AND manifest_sha256=$3 AND tamano_bytes=$4 ORDER BY id DESC LIMIT 1`,
      [name, manifest.sha256, manifestHash, manifest.bytes],
    );
    if (!rows.length)
      throw new OperationError(
        "El archivo y manifiesto no corresponden a un respaldo exitoso registrado en esta base",
      );
    operation.sourceId = rows[0].id;
    await record(client, operation, "INICIADO");
    started = true;
    phase = "contenedor aislado";
    // Nombre aleatorio no reutilizable; Docker rechaza una colisión sin modificar el contenedor existente.
    await run(
      [
        "run",
        "-d",
        "--name",
        container,
        "--network",
        "none",
        "--read-only",
        "--user",
        "postgres",
        "--cap-drop=ALL",
        "--security-opt=no-new-privileges",
        "--pids-limit",
        "128",
        "--memory",
        "1g",
        "--cpus",
        "2",
        "--tmpfs",
        "/var/lib/postgresql:rw,nosuid,nodev,noexec,mode=1777,size=768m",
        "--tmpfs",
        "/var/run/postgresql:rw,nosuid,nodev,noexec,mode=1777,size=16m",
        "--tmpfs",
        "/tmp:rw,nosuid,nodev,noexec,mode=1777,size=16m",
        "-e",
        "POSTGRES_PASSWORD",
        "-e",
        "POSTGRES_DB=excel_restore",
        "-e",
        "POSTGRES_USER=excel_restore",
        "-e",
        "PGDATA=/var/lib/postgresql/data",
        image,
      ],
      { env: restoreEnv, timeout: 120000 },
    );
    created = true;
    let ready = false;
    // Cada intento tarda lo necesario para consultar PostgreSQL, sin esperas largas ni conexión al origen.
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        await run(
          [
            "exec",
            container,
            "pg_isready",
            "-U",
            "excel_restore",
            "-d",
            "excel_restore",
            "-t",
            "2",
          ],
          { timeout: 10000 },
        );
        ready = true;
        break;
      } catch {
        await new Promise((resolveWait) => setTimeout(resolveWait, 500));
      }
    }
    if (!ready) throw new OperationError("PostgreSQL aislado no inició");
    phase = "pg_restore";
    const restored = await run(
      [
        "exec",
        "-i",
        "-e",
        "PGPASSWORD",
        container,
        "pg_restore",
        "--exit-on-error",
        "--single-transaction",
        "--no-owner",
        "--no-acl",
        "--no-password",
        "-U",
        "excel_restore",
        "-d",
        "excel_restore",
      ],
      { input: file, env: restoreEnv },
    );
    if (restored.warnings)
      throw new OperationError(
        "La restauración produjo advertencias y requiere revisión",
      );
    phase = "comparación de datos";
    const query = async (sql, params = []) => {
      // Solo consultas internas y un BIGINT validado obtenido del respaldo; no SQL del operador.
      if (params.some((value) => !/^[1-9]\d*$/.test(value)))
        throw new OperationError("Identificador de verificación inválido");
      const replaced = sql.replace(
        /\$(\d+)/g,
        (_, position) => params[Number(position) - 1],
      );
      const wrapped = `SET timezone='UTC'; SELECT COALESCE(json_agg(q),'[]'::json) FROM (${replaced}) q;`;
      const result = await run(
        [
          "exec",
          "-i",
          "-e",
          "PGPASSWORD",
          container,
          "psql",
          "--no-psqlrc",
          "--no-password",
          "-X",
          "-qAt",
          "-v",
          "ON_ERROR_STOP=1",
          "-U",
          "excel_restore",
          "-d",
          "excel_restore",
          "-c",
          wrapped,
        ],
        { env: restoreEnv, capture: true },
      );
      if (result.warnings)
        throw new OperationError(
          "La consulta de verificación produjo advertencias",
        );
      return { rows: JSON.parse(result.text) };
    };
    const restoredEvidence = await snapshotEvidence(query);
    if (fingerprint(restoredEvidence) !== fingerprint(manifest.evidencia))
      throw new OperationError(
        "Los datos restaurados no coinciden con el snapshot del respaldo",
      );
    phase = "limpieza del entorno aislado";
    await run(["rm", "-f", container], { timeout: 30000 });
    created = false;
    phase = "registro final";
    const complete = Boolean(restoredEvidence.attempt);
    const id = await record(client, operation, "EXITOSO", {
      hash: manifest.sha256,
      manifestHash,
      bytes: manifest.bytes,
      complete,
      detail: complete
        ? "Restauración aislada verificada: esquema, migraciones, conteos e intento académico completo coinciden"
        : "Restauración aislada verificada: esquema, migraciones y conteos; no existe intento completo para consultar",
    });
    return {
      id,
      archivo: name,
      tablas: Object.keys(restoredEvidence.tables).length,
      migraciones: restoredEvidence.migrations.length,
      intentoCompletoVerificado: complete,
      intentoId: restoredEvidence.attempt?.id ?? null,
    };
  } catch (error) {
    if (started) await failed(client, operation, phase);
    if (error instanceof OperationError) throw error;
    throw new OperationError(
      `No se completó la restauración de prueba (${phase})`,
    );
  } finally {
    // Únicamente el contenedor aleatorio que esta ejecución creó satisfactoriamente.
    try {
      if (created)
        await run(["rm", "-f", container], { timeout: 30000 }).catch(() => {
          throw new OperationError(
            "Revise la eliminación del contenedor temporal de esta verificación",
          );
        });
    } finally {
      await client.end();
    }
  }
}

/** Propuesta de retención: informa candidatos; no borra ni modifica archivos o registros. */
export async function retentionPlan(env = process.env, dependencies = {}) {
  const days = Number(env.BACKUP_RETENTION_DAYS);
  if (!Number.isInteger(days) || days < 1 || days > 3650)
    throw new OperationError(
      "Defina BACKUP_RETENTION_DAYS entre 1 y 3650; no hay una política aprobada por defecto",
    );
  const config = configuration(env);
  const client = await (dependencies.connect ?? connect)(config);
  try {
    await authorize(client, config.actor);
    const { rows } = await client.query(
      `SELECT ubicacion_logica,finalizado_at FROM respaldos
      WHERE tipo='RESPALDO' AND estado='EXITOSO' AND finalizado_at < now()-($1::int*interval '1 day')
      ORDER BY finalizado_at`,
      [days],
    );
    return {
      soloPropuesta: true,
      dias: days,
      candidatos: rows.map((row) => ({
        archivo: row.ubicacion_logica,
        fecha: row.finalizado_at,
      })),
      archivosEliminados: 0,
    };
  } finally {
    await client.end();
  }
}
