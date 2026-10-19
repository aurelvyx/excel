import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  actor,
  archiveFile,
  archiveName,
  backupDirectory,
  canonical,
  clientArgs,
  configuration,
  dockerClient,
  readManifest,
  repository,
  sha256,
  validateManifest,
} from "./respaldo/core.mjs";
import {
  backup,
  retentionPlan,
  verifyRestore,
} from "./respaldo/operations.mjs";

const baseEnv = {
  DB_HOST: "127.0.0.1",
  DB_NAME: "synthetic",
  DB_USER: "operator",
  DB_PASSWORD: "Solo-entorno-no-argv",
  DB_SSL: "false",
  BACKUP_SERVICE_ID: "b21-test",
};
async function workspace(run) {
  const directory = await mkdtemp(join(tmpdir(), "excel-backup-unit-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
const completeAttempt = {
  matricula: { id: 5, numero_intento: 2 },
  voucher: { id: 7 },
  notas: [{ nota: 12.5 }],
  asistencias: [{ codigo: "P" }],
  resultados: [{ nota_oficial: 13 }],
};
function fixture({ failure, mismatch = false } = {}) {
  const events = [],
    calls = [];
  const evidenceRows = (sql) => {
    if (sql.includes("FROM pg_tables"))
      return [{ tablename: "matriculas" }, { tablename: "migraciones" }];
    if (sql.includes("count(*)")) return [{ cantidad: "1" }];
    if (sql.includes("name AS nombre"))
      return [{ timestamp: "1790208016000", nombre: "Respaldos1790208016000" }];
    if (sql.includes("jsonb_build_object"))
      return [{ intento: completeAttempt }];
    if (sql.includes("SELECT m.id::text")) return [{ id: "5" }];
    throw new Error(`Unexpected test query: ${sql}`);
  };
  const client = {
    async query(sql, params) {
      if (/^(BEGIN|COMMIT|ROLLBACK|SET LOCAL)/.test(sql)) return { rows: [] };
      if (sql.includes("pg_try_advisory_lock"))
        return { rows: [{ obtenido: true }] };
      if (sql.includes("server_version_num"))
        return { rows: [{ version: 180001 }] };
      if (sql.includes("pg_export_snapshot"))
        return { rows: [{ snapshot: "00000001-00000001-1" }] };
      if (sql.includes("INSERT INTO respaldos")) {
        events.push(params);
        return { rows: [{ id: String(events.length) }] };
      }
      if (sql.includes("INSERT INTO auditoria_eventos")) return { rows: [] };
      if (sql.includes("tipo='RESPALDO' AND estado='EXITOSO'"))
        return { rows: mismatch ? [] : [{ id: "2" }] };
      return { rows: evidenceRows(sql) };
    },
    async end() {
      calls.push(["ended"]);
    },
  };
  return {
    events,
    calls,
    dependencies: {
      connect: async () => client,
      command: async (args, options = {}) => {
        calls.push(args);
        if (args.includes("pg_dump")) {
          await writeFile(options.output, "PGDMP-synthetic-unit-fixture");
          if (failure === "dump")
            throw new Error("Sensitive failure omitted from public error");
        }
        if (
          args.includes("pg_restore") &&
          !args.includes("--list") &&
          failure === "restore"
        )
          throw new Error("restore failed");
        if (args.includes("psql"))
          return {
            warnings: false,
            text: JSON.stringify(evidenceRows(args.at(-1))),
          };
        return { warnings: false, text: "" };
      },
    },
  };
}

test("B21 exige actor único y autentica datos de administrador separados de PostgreSQL", () => {
  assert.throws(() => actor({}), /único/);
  assert.throws(
    () => actor({ BACKUP_ADMIN_ID: "1", BACKUP_SERVICE_ID: "job" }),
    /único/,
  );
  assert.throws(() => actor({ BACKUP_ADMIN_ID: "1" }), /PASSWORD/);
  assert.throws(() => actor({ BACKUP_SERVICE_ID: "../evil" }), /inválido/);
  assert.equal(
    actor({
      BACKUP_ADMIN_ID: "1",
      BACKUP_ADMIN_PASSWORD: "Clave-sintetica-123",
    }).adminId,
    "1",
  );
});
test("B21 valida configuración, conexión local y red Docker sin shell", () =>
  workspace(async (directory) => {
    const config = configuration({ ...baseEnv, BACKUP_DIR: directory });
    assert.equal(config.pg.PGHOST, "host.docker.internal");
    assert.throws(
      () => configuration({ ...baseEnv, BACKUP_DIR: "relative" }),
      /absoluta/,
    );
    assert.throws(
      () =>
        configuration({
          ...baseEnv,
          BACKUP_DIR: directory,
          DB_PORT: "5432;whoami",
        }),
      /entero/,
    );
    assert.throws(
      () =>
        configuration({ ...baseEnv, BACKUP_DIR: directory, DB_SSL: "true" }),
      /certificados/,
    );
    assert.throws(
      () =>
        configuration({
          ...baseEnv,
          BACKUP_DIR: directory,
          BACKUP_DOCKER_NETWORK: "a --privileged",
        }),
      /inválido/,
    );
    const args = clientArgs(config, "synthetic-client", [
      "pg_dump",
      "--format=custom",
    ]);
    assert.equal(args.includes(baseEnv.DB_PASSWORD), false);
    assert.ok(args.includes("PGPASSWORD"));
    assert.ok(args.includes("--cap-drop=ALL"));
  }));
test("B21 rechaza copias dentro del repositorio", async () => {
  await assert.rejects(backupDirectory(repository), /fuera del repositorio/);
});
test("B21 nombres exclusivos y rutas sin recorrido", () => {
  const name = archiveName(
    new Date("2026-10-18T12:00:00.000Z"),
    "26caa813-9973-4450-bcf9-129e6795d4cb",
  );
  assert.match(name, /^excel-20261018T120000000Z-/);
  assert.throws(() => archiveFile(tmpdir(), "../" + name), /nombre/);
  assert.throws(() => archiveFile(tmpdir(), undefined), /nombre/);
  assert.ok(archiveFile(tmpdir(), name).endsWith(name));
});
test("B21 hash estable conserva cero, pendientes y orden de arreglos", () => {
  assert.equal(canonical({ b: 0, a: null }), canonical({ a: null, b: 0 }));
  assert.notEqual(canonical([0, null]), canonical([null, 0]));
});
test("B21 genera snapshot, archivo y manifiesto antes del evento EXITOSO", () =>
  workspace(async (directory) => {
    const f = fixture();
    const result = await backup(
      { ...baseEnv, BACKUP_DIR: directory },
      f.dependencies,
    );
    assert.equal(result.restauracionVerificada, false);
    assert.equal(f.events.length, 2);
    assert.deepEqual(
      f.events.map((event) => event[2]),
      ["INICIADO", "EXITOSO"],
    );
    assert.equal(f.events[0][0], f.events[1][0]);
    assert.equal(f.events[0][10], f.events[1][10]);
    const { manifest } = await readManifest(directory, result.archivo);
    assert.equal(manifest.evidencia.attempt.id, "5");
    assert.equal(manifest.sha256, result.sha256);
    assert.equal(JSON.stringify(manifest).includes("Solo-entorno"), false);
    const dump = f.calls.find((args) => args.includes("pg_dump"));
    assert.ok(dump.includes("--snapshot=00000001-00000001-1"));
    assert.ok(dump.includes("--format=custom"));
  }));
test("B21 un fallo guarda FALLIDO y descarta archivos parciales sin filtrar excepciones", () =>
  workspace(async (directory) => {
    const f = fixture({ failure: "dump" });
    await assert.rejects(
      backup({ ...baseEnv, BACKUP_DIR: directory }, f.dependencies),
      /No se completó el respaldo/,
    );
    assert.deepEqual(
      f.events.map((event) => event[2]),
      ["INICIADO", "FALLIDO"],
    );
    assert.equal(f.events[1][7].includes("Sensitive"), false);
    await assert.rejects(readFile(join(directory, f.events[0][3])));
  }));
test("B21 exige confirmación antes de conectar o restaurar", async () => {
  await assert.rejects(
    verifyRestore(baseEnv, {
      connect: () => {
        throw new Error("must not connect");
      },
    }),
    /confirmar/,
  );
});
test("B21 rechaza manipulación del archivo y campos de manifiesto no permitidos", () =>
  workspace(async (directory) => {
    const f = fixture();
    const result = await backup(
      { ...baseEnv, BACKUP_DIR: directory },
      f.dependencies,
    );
    const file = join(directory, result.archivo);
    const original = await readFile(file);
    await writeFile(file, "changed archive");
    await assert.rejects(readManifest(directory, result.archivo), /SHA256/);
    await writeFile(file, original);
    const manifest = JSON.parse(await readFile(`${file}.json`, "utf8"));
    assert.throws(
      () =>
        validateManifest(
          { ...manifest, password: "forbidden" },
          result.archivo,
        ),
      /campos/,
    );
  }));

test("B21 rechaza enlaces con un nombre de respaldo válido", (t) =>
  workspace(async (directory) => {
    const file = join(directory, "archivo-original.dump");
    await writeFile(file, "contenido sintético");
    const linkedName = archiveName();
    const linked = join(directory, linkedName);
    try {
      await symlink(file, linked);
    } catch (error) {
      if (process.platform === "win32" && error.code === "EPERM") {
        t.skip(
          "El sistema no permite crear enlaces simbólicos con estos permisos",
        );
        return;
      }
      throw error;
    }
    await assert.rejects(readManifest(directory, linkedName), /regular/);
  }));
test("B21 restaura solo en contenedor nuevo sin red ni volumen y comprueba el intento", () =>
  workspace(async (directory) => {
    const f = fixture();
    const result = await backup(
      { ...baseEnv, BACKUP_DIR: directory },
      f.dependencies,
    );
    const verified = await verifyRestore(
      {
        ...baseEnv,
        BACKUP_DIR: directory,
        BACKUP_FILE: result.archivo,
        RESTORE_CONFIRM: "VERIFICAR_EN_CONTENEDOR_NUEVO",
      },
      f.dependencies,
    );
    assert.equal(verified.intentoCompletoVerificado, true);
    assert.equal(verified.intentoId, "5");
    const create = f.calls.find(
      (args) => args.includes("-d") && args.includes("run"),
    );
    assert.equal(create[create.indexOf("--network") + 1], "none");
    assert.ok(create.includes("--read-only"));
    assert.equal(
      create.some((arg) =>
        [
          "--mount",
          "-v",
          "--volume",
          "-p",
          "--publish",
          "--privileged",
        ].includes(arg),
      ),
      false,
    );
    const restore = f.calls.find(
      (args) => args.includes("pg_restore") && !args.includes("--list"),
    );
    assert.ok(restore.includes("--single-transaction"));
    assert.equal(restore.includes("--clean"), false);
    const final = f.events.at(-1);
    assert.equal(final[1], "RESTAURACION");
    assert.equal(final[13], true);
    assert.ok(
      f.calls.some(
        (args) =>
          args[0] === "rm" && args[2] === create[create.indexOf("--name") + 1],
      ),
    );
  }));
test("B21 espera al servidor TCP definitivo aunque el socket temporal ya acepte conexiones", () =>
  workspace(async (directory) => {
    const f = fixture();
    const originalCommand = f.dependencies.command;
    let tcpProbes = 0;
    let tcpReady = false;
    f.dependencies.command = async (args, options) => {
      if (args.includes("pg_isready")) {
        const result = await originalCommand(args, options);
        // El servidor temporal del entrypoint responde por socket, pero no por TCP.
        if (
          args[args.indexOf("-h") + 1] !== "127.0.0.1" ||
          args[args.indexOf("-p") + 1] !== "5432"
        )
          return result;
        tcpProbes++;
        if (tcpProbes === 1)
          throw new Error("El servidor definitivo todavía no acepta TCP");
        tcpReady = true;
        return result;
      }
      if (args.includes("pg_restore") && !args.includes("--list"))
        assert.equal(
          tcpReady,
          true,
          "La restauración no puede comenzar con el servidor temporal del socket",
        );
      return originalCommand(args, options);
    };
    const result = await backup(
      { ...baseEnv, BACKUP_DIR: directory },
      f.dependencies,
    );
    const verified = await verifyRestore(
      {
        ...baseEnv,
        BACKUP_DIR: directory,
        BACKUP_FILE: result.archivo,
        RESTORE_CONFIRM: "VERIFICAR_EN_CONTENEDOR_NUEVO",
      },
      f.dependencies,
    );
    assert.equal(tcpProbes, 2);
    assert.equal(verified.intentoCompletoVerificado, true);
    const connections = f.calls.filter(
      (args) =>
        args.includes("pg_isready") ||
        (args.includes("pg_restore") && !args.includes("--list")) ||
        args.includes("psql"),
    );
    assert.ok(connections.some((args) => args.includes("psql")));
    for (const args of connections) {
      assert.equal(args[args.indexOf("-h") + 1], "127.0.0.1");
      assert.equal(args[args.indexOf("-p") + 1], "5432");
    }
    assert.equal(f.events.at(-1)[2], "EXITOSO");
  }));
test("B21 manifiesto alterado aunque válido no permite restaurar sin huella registrada", () =>
  workspace(async (directory) => {
    const f = fixture({ mismatch: true });
    const result = await backup(
      { ...baseEnv, BACKUP_DIR: directory },
      f.dependencies,
    );
    await assert.rejects(
      verifyRestore(
        {
          ...baseEnv,
          BACKUP_DIR: directory,
          BACKUP_FILE: result.archivo,
          RESTORE_CONFIRM: "VERIFICAR_EN_CONTENEDOR_NUEVO",
        },
        f.dependencies,
      ),
      /registrado/,
    );
    assert.equal(f.events.length, 2);
    assert.equal(
      f.calls.some((args) => args.includes("run") && args.includes("-d")),
      false,
    );
  }));
test("B21 fallo de pg_restore conserva fuente, registra FALLIDO y elimina solo su contenedor", () =>
  workspace(async (directory) => {
    const f = fixture({ failure: "restore" });
    const result = await backup(
      { ...baseEnv, BACKUP_DIR: directory },
      f.dependencies,
    );
    await assert.rejects(
      verifyRestore(
        {
          ...baseEnv,
          BACKUP_DIR: directory,
          BACKUP_FILE: result.archivo,
          RESTORE_CONFIRM: "VERIFICAR_EN_CONTENEDOR_NUEVO",
        },
        f.dependencies,
      ),
      /restauración de prueba/,
    );
    assert.equal(f.events.at(-1)[2], "FALLIDO");
    assert.equal(await sha256(join(directory, result.archivo)), result.sha256);
    assert.equal(
      f.calls.filter(
        (args) =>
          args[0] === "rm" && args[2]?.startsWith("excel-restore-check-"),
      ).length,
      1,
    );
  }));
test("B21 retención no tiene valores supuestos ni borra archivos", async () => {
  await assert.rejects(retentionPlan(baseEnv), /política aprobada/);
  await assert.rejects(
    retentionPlan({ ...baseEnv, BACKUP_RETENTION_DAYS: "0" }),
    /política aprobada/,
  );
});

test("B21 no elimina un contenedor ajeno si Docker rechaza una colisión", async () => {
  const calls = [];
  const run = async (args) => {
    calls.push(args);
    if (args[0] === "run") throw new Error("synthetic collision");
    return { text: "unrelated-owner" };
  };
  await assert.rejects(
    dockerClient({ pg: {}, network: "test" }, ["pg_dump"], {}, run),
    /collision/,
  );
  assert.equal(
    calls.some((args) => args[0] === "rm"),
    false,
  );
});
