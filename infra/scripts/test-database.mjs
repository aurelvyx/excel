import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
const options = process.argv.slice(2);
if (options.length > 1 || (options.length === 1 && options[0] !== "--b10")) {
  throw new Error("Usar pnpm test:db o pnpm test:b10");
}
const b10 = options[0] === "--b10";
const report = join(root, ".tmp", b10 ? "b10" : "verificacion", "pruebas.json");
mkdirSync(dirname(report), { recursive: true });
// Impide confundir un informe anterior con esta ejecución si Docker o Vitest fallan al iniciar.
rmSync(report, { force: true });
const project = `excel-test-${randomBytes(6).toString("hex")}`;
const env = {
  ...process.env,
  TEST_DB_PASSWORD: randomBytes(24).toString("hex"),
};
const compose = ["compose", "-p", project, "-f", "infra/compose.test.yaml"];
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    encoding: "utf8",
    stdio: "inherit",
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} terminó con código ${result.status}`);
  return result.stdout?.trim();
}
try {
  run("docker", [...compose, "up", "-d", "--wait", "--wait-timeout", "120"]);
  const address = run("docker", [...compose, "port", "postgres", "5432"], {
    stdio: "pipe",
  });
  const port = address.match(/:(\d+)$/)?.[1];
  if (!port)
    throw new Error("No se pudo determinar el puerto de PostgreSQL de prueba");
  Object.assign(env, {
    NODE_ENV: "test",
    DB_HOST: "127.0.0.1",
    DB_PORT: port,
    DB_NAME: "excel_test",
    DB_USER: "excel_test",
    DB_PASSWORD: env.TEST_DB_PASSWORD,
    DB_SSL: "false",
    ALLOW_DEMO_SEED: "true",
  });
  // npm_execpath lo proporciona pnpm; evita shells y rutas de ejecutables específicas del SO.
  if (!process.env.npm_execpath)
    throw new Error("Ejecutar mediante pnpm test:db");
  const pnpmPath = process.env.npm_execpath;
  const args = ["--filter", "api", "test:integration"];
  if (b10)
    args.push(
      "test/students.integration-spec.ts",
      "test/vouchers.integration-spec.ts",
      "test/enrollments.integration-spec.ts",
      "test/enrollments-web.integration-spec.ts",
    );
  args.push(
    "--reporter=default",
    "--reporter=json",
    `--outputFile.json=${report}`,
  );
  if (/\.(c?js|mjs)$/.test(pnpmPath)) {
    run(process.execPath, [pnpmPath, ...args]);
  } else {
    run(pnpmPath, args);
  }
} finally {
  run("docker", [...compose, "down", "--remove-orphans"]);
}
