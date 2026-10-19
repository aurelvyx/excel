import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  unlink,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

export const repository = fileURLToPath(new URL("../../../", import.meta.url));
const requireApi = createRequire(
  new URL("../../../apps/api/package.json", import.meta.url),
);
export const image = "postgres:18";
const archivePattern = /^excel-\d{8}T\d{9}Z-[0-9a-f-]{36}\.dump$/;
const hashPattern = /^[0-9a-f]{64}$/;
export class OperationError extends Error {}
const fail = (message) => {
  throw new OperationError(message);
};

export function integer(value, name, maximum = 65535) {
  if (
    !/^\d+$/.test(value ?? "") ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) < 1 ||
    Number(value) > maximum
  )
    fail(`${name} debe ser un entero positivo válido`);
  return Number(value);
}
export function actor(env) {
  if (Boolean(env.BACKUP_ADMIN_ID) === Boolean(env.BACKUP_SERVICE_ID))
    fail("Defina un único responsable: BACKUP_ADMIN_ID o BACKUP_SERVICE_ID");
  if (env.BACKUP_ADMIN_ID) {
    if (!/^[1-9]\d{0,18}$/.test(env.BACKUP_ADMIN_ID))
      fail("BACKUP_ADMIN_ID inválido");
    if (
      !env.BACKUP_ADMIN_PASSWORD ||
      env.BACKUP_ADMIN_PASSWORD.length < 12 ||
      env.BACKUP_ADMIN_PASSWORD.length > 128
    )
      fail(
        "BACKUP_ADMIN_PASSWORD debe contener la contraseña del administrador",
      );
    return {
      adminId: env.BACKUP_ADMIN_ID,
      serviceId: null,
      password: env.BACKUP_ADMIN_PASSWORD,
    };
  }
  if (!/^[A-Za-z][A-Za-z0-9_-]{2,79}$/.test(env.BACKUP_SERVICE_ID))
    fail("BACKUP_SERVICE_ID inválido");
  return { adminId: null, serviceId: env.BACKUP_SERVICE_ID };
}
export function configuration(env = process.env) {
  for (const key of [
    "DB_HOST",
    "DB_NAME",
    "DB_USER",
    "DB_PASSWORD",
    "BACKUP_DIR",
  ])
    if (!env[key]?.trim() || /[\r\n\0]/.test(env[key]))
      fail(`Falta ${key} o contiene caracteres inválidos`);
  if (!isAbsolute(env.BACKUP_DIR))
    fail("BACKUP_DIR debe ser una ruta absoluta fuera del repositorio");
  if (env.DB_SSL !== undefined && !["true", "false"].includes(env.DB_SSL))
    fail("DB_SSL inválido");
  if (env.DB_SSL === "true")
    fail(
      "Este procedimiento Docker requiere una conexión local de confianza; TLS remoto necesita una configuración de certificados aprobada",
    );
  const network = env.BACKUP_DOCKER_NETWORK;
  if (network && !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(network))
    fail("BACKUP_DOCKER_NETWORK inválido");
  const dockerHost =
    env.BACKUP_DOCKER_DB_HOST ??
    (["127.0.0.1", "localhost", "::1"].includes(env.DB_HOST)
      ? "host.docker.internal"
      : env.DB_HOST);
  if (!/^[A-Za-z0-9_.:-]{1,253}$/.test(dockerHost))
    fail("BACKUP_DOCKER_DB_HOST inválido");
  const port = integer(env.DB_PORT ?? "5432", "DB_PORT");
  const dockerPort = integer(
    env.BACKUP_DOCKER_DB_PORT ?? String(port),
    "BACKUP_DOCKER_DB_PORT",
  );
  return {
    directory: resolve(env.BACKUP_DIR),
    actor: actor(env),
    network,
    database: {
      host: env.DB_HOST,
      port,
      database: env.DB_NAME,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      ssl: false,
      connectionTimeoutMillis: 15000,
    },
    pg: {
      PGHOST: dockerHost,
      PGPORT: String(dockerPort),
      PGDATABASE: env.DB_NAME,
      PGUSER: env.DB_USER,
      PGPASSWORD: env.DB_PASSWORD,
      PGCONNECT_TIMEOUT: "15",
      PGSSLMODE: "disable",
    },
  };
}
export async function backupDirectory(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const actual = await realpath(directory);
  const repo = await realpath(repository);
  const inside = relative(repo, actual);
  if (
    !inside ||
    (!inside.startsWith(`..${sep}`) && inside !== ".." && !isAbsolute(inside))
  )
    fail(
      "El directorio de respaldo debe estar fuera del repositorio, incluidos sus enlaces",
    );
  return actual;
}
export function archiveName(now = new Date(), id = randomUUID()) {
  return `excel-${now.toISOString().replace(/[-:.]/g, "")}-${id}.dump`;
}
export function archiveFile(directory, name) {
  if (
    typeof name !== "string" ||
    name !== basename(name) ||
    !archivePattern.test(name)
  )
    fail(
      "BACKUP_FILE debe ser el nombre de un respaldo generado por esta herramienta",
    );
  return resolve(directory, name);
}
export async function regularFile(file) {
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size === 0)
    fail("El respaldo debe ser un archivo regular no vacío");
  return info;
}
export async function sha256(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
export function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
    .join(",")}}`;
}
export function fingerprint(value) {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

/** Sin shell, sin credenciales en argumentos y sin imprimir stderr de PostgreSQL. */
export async function command(
  args,
  {
    env = {},
    input,
    output,
    outputHandle,
    capture = false,
    timeout = 1800000,
  } = {},
) {
  const child = spawn("docker", args, {
    env: { ...process.env, ...env },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  const done = new Promise((resolveExit, reject) => {
    child.once("error", () =>
      reject(new OperationError("No se pudo iniciar Docker")),
    );
    child.once("close", (code) =>
      code === 0
        ? resolveExit()
        : reject(
            new OperationError(
              "La operación PostgreSQL/Docker falló; no se registró como verificada",
            ),
          ),
    );
  });
  let text = "";
  let warnings = false;
  child.stderr.on("data", () => {
    warnings = true;
  });
  const timer = setTimeout(() => child.kill(), timeout);
  timer.unref();
  const streams = [];
  if (input) streams.push(pipeline(createReadStream(input), child.stdin));
  else child.stdin.end();
  if (output)
    streams.push(
      pipeline(
        child.stdout,
        createWriteStream(
          output,
          outputHandle
            ? { fd: outputHandle.fd, autoClose: false }
            : { flags: "wx", mode: 0o600 },
        ),
      ),
    );
  else
    child.stdout.on("data", (chunk) => {
      if (capture) {
        text += chunk.toString("utf8");
        if (text.length > 10_000_000) child.kill();
      }
    });
  try {
    await Promise.all([done, ...streams]);
    return { text: text.trim(), warnings };
  } catch (error) {
    child.kill();
    throw error instanceof OperationError
      ? error
      : new OperationError(
          "No se pudo completar la transferencia del respaldo",
        );
  } finally {
    clearTimeout(timer);
  }
}
export function clientArgs(config, name, operation) {
  return [
    "run",
    "--rm",
    "--name",
    name,
    "--label",
    `excel.backup.client=${name}`,
    "-i",
    "--read-only",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    ...(config.network
      ? ["--network", config.network]
      : ["--add-host", "host.docker.internal:host-gateway"]),
    ...Object.keys(config.pg).flatMap((key) => ["-e", key]),
    image,
    ...operation,
  ];
}
export async function dockerClient(config, operation, options, run = command) {
  const name = `excel-backup-client-${randomUUID()}`;
  try {
    return await run(clientArgs(config, name, operation), {
      ...options,
      env: config.pg,
    });
  } finally {
    // Un nombre aleatorio no basta para autorizar la eliminación si Docker rechazó una colisión.
    const owned = await run(
      [
        "inspect",
        "--format",
        '{{index .Config.Labels "excel.backup.client"}}',
        name,
      ],
      { capture: true, timeout: 15000 },
    ).catch(() => null);
    if (owned?.text === name)
      await run(["rm", "-f", name], { timeout: 15000 }).catch(() => {});
  }
}
export async function connect(config) {
  const { Client } = requireApi("pg");
  const client = new Client(config.database);
  try {
    await client.connect();
    return client;
  } catch {
    await client.end().catch(() => {});
    fail("No se pudo conectar a la base de origen");
  }
}
export async function authorize(client, responsible) {
  if (responsible.serviceId) return;
  const result = await client.query(
    `SELECT u.id,u.password_hash FROM usuarios u JOIN usuario_roles ur ON ur.usuario_id=u.id
    JOIN roles r ON r.id=ur.rol_id WHERE u.id=$1 AND u.activo AND NOT u.requiere_cambio_clave AND r.activo AND r.codigo='ADMIN'`,
    [responsible.adminId],
  );
  const { verify } = requireApi("argon2");
  let valid = false;
  if (result.rowCount)
    valid = await verify(
      result.rows[0].password_hash,
      responsible.password,
    ).catch(() => false);
  if (!valid) fail("No se pudo autenticar al administrador activo");
}

export async function snapshotEvidence(query) {
  const { rows: tables } = await query(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
  );
  const counts = {};
  for (const { tablename } of tables) {
    if (!/^[a-z][a-z0-9_]*$/.test(tablename))
      fail(
        "El esquema contiene identificadores fuera de la convención prevista",
      );
    const { rows } = await query(
      `SELECT count(*)::text AS cantidad FROM public."${tablename}"`,
    );
    counts[tablename] = rows[0].cantidad;
  }
  const { rows: migrations } = await query(
    "SELECT timestamp::text,nombre FROM (SELECT timestamp,name AS nombre FROM migraciones) m ORDER BY timestamp",
  );
  const { rows: attempts } = await query(`SELECT m.id::text FROM matriculas m
    JOIN vouchers v ON v.id=m.voucher_id AND v.estado='VALIDADO'
    WHERE m.estado='CERRADA' AND EXISTS(SELECT 1 FROM asistencias a WHERE a.matricula_id=m.id)
    AND EXISTS(SELECT 1 FROM calificaciones c WHERE c.matricula_id=m.id)
    AND EXISTS(SELECT 1 FROM resultados_academicos r WHERE r.matricula_id=m.id AND r.confirmado_at IS NOT NULL
      AND r.cierre_id IS NOT NULL AND r.configuracion_id IS NOT NULL AND r.calculo IS NOT NULL)
    ORDER BY m.id DESC LIMIT 1`);
  let attempt = null;
  if (attempts.length) {
    const id = attempts[0].id;
    const { rows } = await query(
      `SELECT jsonb_build_object(
      'matricula',to_jsonb(m),'voucher',to_jsonb(v),'reglas',to_jsonb(p),
      'estudiante',to_jsonb(est),'persona',to_jsonb(persona),'grupo',to_jsonb(g),
      'configuracion',to_jsonb(cfg),'plan',to_jsonb(plan),
      'evaluaciones',COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM evaluaciones e WHERE e.configuracion_id=cfg.id),'[]'::jsonb),
      'indicadores',COALESCE((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id) FROM indicadores_evaluacion i JOIN evaluaciones e ON e.id=i.evaluacion_id WHERE e.configuracion_id=cfg.id),'[]'::jsonb),
      'asistencias',COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM asistencias a WHERE a.matricula_id=m.id),'[]'::jsonb),
      'sesiones',COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM sesiones_clase s WHERE s.grupo_id=m.grupo_id),'[]'::jsonb),
      'justificaciones',COALESCE((SELECT jsonb_agg(to_jsonb(j) ORDER BY j.id) FROM justificaciones j JOIN asistencias a ON a.id=j.asistencia_id WHERE a.matricula_id=m.id),'[]'::jsonb),
      'notas',COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM calificaciones c WHERE c.matricula_id=m.id),'[]'::jsonb),
      'resultados',COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM resultados_academicos r WHERE r.matricula_id=m.id),'[]'::jsonb),
      'cierres',COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM cierres_academicos c WHERE c.grupo_id=m.grupo_id),'[]'::jsonb)
      )::text AS intento FROM matriculas m JOIN vouchers v ON v.id=m.voucher_id
      JOIN parametros_academicos p ON p.id=m.parametro_id JOIN estudiantes est ON est.id=m.estudiante_id
      JOIN personas persona ON persona.id=est.persona_id JOIN grupos g ON g.id=m.grupo_id
      JOIN resultados_academicos r ON r.matricula_id=m.id
      JOIN configuraciones_evaluacion_grupo cfg ON cfg.id=r.configuracion_id
      JOIN planes_evaluacion plan ON plan.id=cfg.plan_id WHERE m.id=$1`,
      [id],
    );
    attempt = { id, sha256: fingerprint(rows[0].intento) };
  }
  return { tables: counts, migrations, attempt };
}
export function validateManifest(value, name) {
  if (
    value?.version !== 1 ||
    value.archivo !== name ||
    value.formato !== "PG_CUSTOM_18" ||
    !hashPattern.test(value.sha256 ?? "") ||
    !Number.isSafeInteger(value.bytes) ||
    value.bytes < 1 ||
    !value.evidencia?.tables ||
    !Array.isArray(value.evidencia.migrations) ||
    !value.evidencia.migrations.length
  )
    fail("El manifiesto del respaldo es inválido");
  if (
    Object.keys(value).some(
      (key) =>
        ![
          "version",
          "archivo",
          "formato",
          "sha256",
          "bytes",
          "creadoAt",
          "evidencia",
        ].includes(key),
    )
  )
    fail("El manifiesto contiene campos no permitidos");
  if (
    Object.entries(value.evidencia.tables).some(
      ([key, count]) => !/^[a-z][a-z0-9_]*$/.test(key) || !/^\d+$/.test(count),
    )
  )
    fail("Los conteos del manifiesto son inválidos");
  if (
    value.evidencia.attempt !== null &&
    (!/^[1-9]\d*$/.test(value.evidencia.attempt?.id ?? "") ||
      !hashPattern.test(value.evidencia.attempt?.sha256 ?? ""))
  )
    fail("La evidencia del intento es inválida");
  return value;
}
export async function readManifest(directory, name) {
  const file = archiveFile(directory, name);
  const info = await regularFile(file);
  await regularFile(`${file}.json`);
  const manifest = validateManifest(
    JSON.parse(await readFile(`${file}.json`, "utf8")),
    name,
  );
  if (manifest.bytes !== info.size || manifest.sha256 !== (await sha256(file)))
    fail("El respaldo no coincide con su manifiesto SHA256");
  return { file, manifest, manifestHash: await sha256(`${file}.json`) };
}
export async function durableJson(file, data) {
  const handle = await open(file, "wx", 0o600);
  let complete = false;
  try {
    await handle.writeFile(`${JSON.stringify(data, null, 2)}\n`);
    await handle.sync();
    complete = true;
  } finally {
    await handle.close();
    if (!complete) await removePartial(file);
  }
}
export async function removePartial(file) {
  if (file) await unlink(file).catch(() => {});
}
