import { test } from "node:test";
import assert from "node:assert/strict";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { parseEnv } from "node:util";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "excel-b21-env-"));
  mkdirSync(join(root, "infra/scripts"), { recursive: true });
  for (const file of [".env.deploy.example", ".env.coolify.example"]) {
    copyFileSync(
      new URL(`../${file}`, import.meta.url),
      join(root, "infra", file),
    );
  }
  const script = join(root, "infra/scripts/setup-deploy-env.mjs");
  copyFileSync(new URL("./setup-deploy-env.mjs", import.meta.url), script);
  t.after(() => {
    const target = resolve(root);
    if (
      !target.startsWith(resolve(tmpdir()) + sep) ||
      !target.split(sep).at(-1).startsWith("excel-b21-env-")
    ) {
      throw new Error(
        "Ruta de limpieza fuera del directorio temporal de pruebas",
      );
    }
    rmSync(target, { recursive: true });
  });
  return {
    root,
    run: (...args) =>
      spawnSync(process.execPath, [script, ...args], { encoding: "utf8" }),
  };
}

for (const mode of ["deploy", "coolify"]) {
  test(`B21 genera secreto independiente de ${mode} sin mostrarlo y conserva el archivo`, (t) => {
    const { root, run } = fixture(t);
    const args = mode === "coolify" ? ["--coolify"] : [];
    const first = run(...args);
    assert.equal(first.status, 0, first.stderr);
    const path = join(root, "infra", `.env.${mode}`);
    const original = readFileSync(path, "utf8");
    const config = parseEnv(original);
    assert.match(config.POSTGRES_PASSWORD, /^[a-f0-9]{64}$/);
    assert.match(config.APP_DB_PASSWORD, /^[a-f0-9]{64}$/);
    assert.notEqual(config.APP_DB_PASSWORD, config.POSTGRES_PASSWORD);
    assert.ok(!first.stdout.includes(config.POSTGRES_PASSWORD));
    assert.ok(!first.stdout.includes(config.APP_DB_PASSWORD));
    assert.equal(run(...args).status, 0);
    assert.equal(readFileSync(path, "utf8"), original);
    if (mode === "coolify") assert.equal(config.WEB_ORIGINS, "");
  });
}

test("B21 no reemplaza una configuración existente con contraseña vacía", (t) => {
  const { root, run } = fixture(t);
  const path = join(root, "infra/.env.deploy");
  const original = "POSTGRES_PASSWORD=\nCONFIGURACION_EXISTENTE=true\n";
  writeFileSync(path, original);
  const result = run();
  assert.notEqual(result.status, 0);
  assert.equal(readFileSync(path, "utf8"), original);
});

test("B21 entornos demo y Coolify son distintos y no acepta opciones desconocidas", (t) => {
  const { root, run } = fixture(t);
  assert.notEqual(run("--produccion").status, 0);
  assert.equal(run().status, 0);
  assert.equal(run("--coolify").status, 0);
  const demo = parseEnv(readFileSync(join(root, "infra/.env.deploy"), "utf8"));
  const coolify = parseEnv(
    readFileSync(join(root, "infra/.env.coolify"), "utf8"),
  );
  assert.notEqual(demo.POSTGRES_PASSWORD, coolify.POSTGRES_PASSWORD);
});
