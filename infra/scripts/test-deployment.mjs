import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:https";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const reportPath = new URL("../../.tmp/b21/despliegue.json", import.meta.url);
mkdirSync(new URL("../../.tmp/b21/", import.meta.url), { recursive: true });
rmSync(reportPath, { force: true });
const project = `excel-deploy-test-${randomBytes(6).toString("hex")}`;
const server = createServer();
await new Promise((resolve, reject) =>
  server.once("error", reject).listen(0, "127.0.0.1", resolve),
);
const port = server.address().port;
await new Promise((resolve, reject) =>
  server.close((error) => (error ? reject(error) : resolve())),
);
const origin = `https://localhost:${port}`;
const env = {
  ...process.env,
  POSTGRES_DB: "excel_deploy_test",
  POSTGRES_USER: "excel_owner",
  POSTGRES_PASSWORD: randomBytes(32).toString("hex"),
  APP_DB_USER: "excel_app",
  APP_DB_PASSWORD: randomBytes(32).toString("hex"),
  DEMO_HTTPS_PORT: String(port),
  EXCEL_IMAGE_TAG: process.env.EXCEL_IMAGE_TAG || "b21",
  BOOTSTRAP_ADMIN_USERNAME: "b21.admin",
  BOOTSTRAP_ADMIN_PASSWORD: randomBytes(32).toString("hex"),
};
const compose = ["compose", "-p", project, "-f", "infra/compose.deploy.yaml"];
function docker(args, { capture = false, allowFailure = false } = {}) {
  const result = spawnSync("docker", args, {
    cwd: root,
    env,
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
  });
  if (!allowFailure && result.status !== 0)
    throw new Error(
      `Falló la comprobación Docker (${result.status ?? "no disponible"}).`,
    );
  return result;
}
const run = (...args) => docker([...compose, ...args]);
const capture = (...args) =>
  docker([...compose, ...args], { capture: true }).stdout.trim();
let localCa;
function https(path, method = "GET", body, headers = {}) {
  return new Promise((resolve, reject) => {
    // Confianza limitada a la CA pública de este proyecto temporal; valida certificado y hostname.
    assert.ok(
      localCa,
      "La CA local debe obtenerse antes de las solicitudes HTTPS",
    );
    const req = request(
      new URL(path, origin),
      { method, ca: localCa, servername: "localhost", headers },
      (res) => {
        const parts = [];
        res.on("data", (data) => parts.push(data));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(parts).toString("utf8"),
          }),
        );
      },
    );
    req.on("error", reject);
    req.setTimeout(15000, () =>
      req.destroy(new Error("Tiempo de espera local agotado")),
    );
    req.end(body ? JSON.stringify(body) : undefined);
  });
}
const checks = [];
try {
  run("config", "--quiet");
  run("up", "-d", "--wait", "--wait-timeout", "120", "postgres");
  run("run", "--rm", "ops");
  // Simula una concesión excesiva del operador; la preparación debe retirarla.
  run(
    "run",
    "--rm",
    "ops",
    "node",
    "--input-type=module",
    "-e",
    `
    import {createDataSource} from './dist/database/configuracion/data-source.js';
    const source=createDataSource();
    try {
      await source.initialize();
      const [{sql}]=await source.query('SELECT format($1::text,$2::text) AS sql',['GRANT TRUNCATE, TRIGGER ON auditoria_eventos TO %I',process.env.APP_DB_USER]);
      await source.query(sql);
    } finally {if(source.isInitialized)await source.destroy();}
  `,
  );
  run("run", "--rm", "ops");
  checks.push(
    "Migraciones y preparación del rol de API son explícitas e idempotentes; retiran permisos TRUNCATE/TRIGGER concedidos por error.",
  );
  run(
    "run",
    "--rm",
    "-e",
    "BOOTSTRAP_ADMIN_USERNAME",
    "-e",
    "BOOTSTRAP_ADMIN_PASSWORD",
    "ops",
    "node",
    "dist/database/bootstrap-admin.js",
  );
  run("up", "-d", "--wait", "--wait-timeout", "120");
  localCa = capture(
    "exec",
    "-T",
    "web",
    "cat",
    "/data/caddy/pki/authorities/local/root.crt",
  );
  assert.match(localCa, /-----BEGIN CERTIFICATE-----/);
  writeFileSync(
    new URL("../../.tmp/b21/ca-local.crt", import.meta.url),
    `${localCa}\n`,
  );
  for (const service of ["postgres", "api"]) {
    const id = capture("ps", "-q", service);
    const [details] = JSON.parse(
      docker(["inspect", id], { capture: true }).stdout,
    );
    assert.ok(
      !details.HostConfig.PortBindings ||
        Object.keys(details.HostConfig.PortBindings).length === 0,
    );
  }
  checks.push("PostgreSQL y API no publican puertos del anfitrión.");
  const page = await https("/");
  assert.equal(page.status, 200);
  assert.match(page.body, /<div id="root"><\/div>/);
  const asset = page.body.match(/src="([^\"]+\.js)"/)[1];
  assert.equal((await https(asset)).status, 200);
  const health = await https("/api/v1/health");
  assert.equal(health.status, 200);
  assert.deepEqual(JSON.parse(health.body), { status: "ok", database: "up" });
  checks.push(
    "React, sus recursos y la API funcionan en el mismo origen HTTPS con certificado y hostname verificados mediante la CA local pública.",
  );
  const loginBody = {
    nombreUsuario: env.BOOTSTRAP_ADMIN_USERNAME,
    password: env.BOOTSTRAP_ADMIN_PASSWORD,
  };
  const loginHeaders = {
    Origin: origin,
    "X-Requested-With": "Excel-Web",
    "Content-Type": "application/json",
    "X-Forwarded-For": "203.0.113.123",
    "X-Real-IP": "203.0.113.123",
  };
  const login = await https(
    "/api/v1/auth/login",
    "POST",
    loginBody,
    loginHeaders,
  );
  assert.equal(login.status, 200);
  const cookie = login.headers["set-cookie"][0];
  assert.match(cookie, /; Secure/);
  assert.match(cookie, /; HttpOnly/);
  assert.match(cookie, /; SameSite=Strict/);
  const session = JSON.parse(login.body);
  assert.equal(session.user.requiere_cambio_clave, true);
  const current = await https("/api/v1/auth/me", "GET", undefined, {
    Cookie: cookie.split(";")[0],
  });
  assert.equal(current.status, 200);
  const csrfDenied = await https(
    "/api/v1/auth/logout",
    "POST",
    {},
    {
      "Content-Type": "application/json",
      Origin: origin,
      Cookie: cookie.split(";")[0],
    },
  );
  assert.equal(csrfDenied.status, 403);
  const logout = await https(
    "/api/v1/auth/logout",
    "POST",
    {},
    {
      "Content-Type": "application/json",
      Origin: origin,
      Cookie: cookie.split(";")[0],
      "X-CSRF-Token": session.csrfToken,
    },
  );
  assert.equal(logout.status, 204);
  checks.push(
    "Argon2, sesión Secure/HttpOnly/SameSite y denegación CSRF funcionan detrás del proxy.",
  );
  const [webDetails] = JSON.parse(
    docker(["inspect", capture("ps", "-q", "web")], { capture: true }).stdout,
  );
  const webPrivateIp =
    webDetails.NetworkSettings.Networks[`${project}_private`].IPAddress;
  const probe = `
    import assert from 'node:assert/strict';
    import {existsSync,readFileSync} from 'node:fs';
    import {createHash} from 'node:crypto';
    import pg from 'pg';
    const client = new pg.Client({host:process.env.DB_HOST,port:5432,database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD});
    await client.connect();
    try {
      const {rows:[role]} = await client.query('SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=current_user');
      assert.ok(Object.values(role).every(value=>value===false));
      const {rows:[acl]}=await client.query("SELECT has_table_privilege(current_user,'auditoria_eventos','TRUNCATE') AS truncar,has_table_privilege(current_user,'auditoria_eventos','TRIGGER') AS alterar_trigger");
      assert.deepEqual(acl,{truncar:false,alterar_trigger:false});
      for (const sql of ['CREATE TABLE public.b21_prohibida(id integer)','CREATE SCHEMA b21_prohibido','CREATE TEMP TABLE b21_temporal(id integer)','ALTER TABLE auditoria_eventos DISABLE TRIGGER USER']) {
        await assert.rejects(client.query(sql),error=>error.code==='42501');
      }
      await assert.rejects(client.query('UPDATE auditoria_eventos SET motivo=motivo WHERE false'),error=>error.code==='23514');
      assert.ok(Number((await client.query('SELECT count(*) FROM auditoria_eventos')).rows[0].count)>0);
      const {rows:[login]}=await client.query("SELECT host(ip_origen) AS ip FROM auditoria_eventos WHERE accion='LOGIN' ORDER BY id DESC LIMIT 1");
      assert.ok(login.ip);
      assert.notEqual(login.ip,'203.0.113.123','No se debe confiar en X-Forwarded-For recibido del navegador');
      assert.notEqual(login.ip,${JSON.stringify(webPrivateIp)},'La API debe conservar la IP depurada por Caddy, no la del contenedor web');
      assert.equal(existsSync('/app/.env'),false);
      assert.equal(existsSync('/app/src'),false);
      assert.equal(existsSync('/app/node_modules/@nestjs/cli'),false);
      const registry=JSON.parse(readFileSync('/app/templates/reportes/registro.json','utf8'));
      assert.equal(registry.plantillas.length,4);
      for(const template of registry.plantillas) assert.equal(createHash('sha256').update(readFileSync('/app/templates/reportes/'+template.archivo)).digest('hex'),template.sha256);
      console.log('Rol API sin DDL; auditoría protegida; imagen con dependencias de producción y cuatro plantillas íntegras.');
    } finally {await client.end();}
  `;
  run("exec", "-T", "api", "node", "--input-type=module", "-e", probe);
  checks.push(
    "El rol de API carece de DDL/privilegios administrativos y no puede desactivar la auditoría.",
  );
  checks.push(
    "La imagen de API contiene las cuatro plantillas con sus hashes, sin .env ni código o herramientas de desarrollo.",
  );
  checks.push(
    "La auditoría conserva la IP depurada por el proxy e ignora cabeceras de IP falsificadas por el cliente.",
  );
  run(
    "run",
    "--rm",
    "--no-deps",
    "web",
    "caddy",
    "validate",
    "--config",
    "/etc/caddy/Caddyfile.coolify",
    "--adapter",
    "caddyfile",
  );
  checks.push(
    "La misma imagen valida la variante HTTP interna para el proxy de Coolify.",
  );
  writeFileSync(
    reportPath,
    `${JSON.stringify({ estado: "APROBADO", entorno: "DEMOSTRACION_LOCAL", datos: "SINTETICOS", fechaUTC: new Date().toISOString(), verificaciones: checks, coolifyRemoto: "NO_EJECUTADO" }, null, 2)}\n`,
  );
  console.log(
    `Despliegue local comprobado: ${checks.length} verificaciones. Informe sin secretos en .tmp/b21/despliegue.json.`,
  );
} finally {
  // Sólo se elimina el proyecto aleatorio creado por este proceso; no toca volúmenes previos.
  docker([...compose, "down", "--volumes", "--remove-orphans"], {
    allowFailure: true,
  });
}
