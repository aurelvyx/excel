import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { parseEnv } from "node:util";

const options = process.argv.slice(2);
if (options.length > 1 || (options[0] && options[0] !== "--coolify")) {
  throw new Error("Uso: pnpm deploy:setup [--coolify]");
}
const mode = options[0] === "--coolify" ? "coolify" : "deploy";
const path = new URL(`../.env.${mode}`, import.meta.url);
if (!existsSync(path)) {
  const example = readFileSync(
    new URL(`../.env.${mode}.example`, import.meta.url),
    "utf8",
  );
  const content = example
    .replace(
      "POSTGRES_PASSWORD=",
      `POSTGRES_PASSWORD=${randomBytes(32).toString("hex")}`,
    )
    .replace(
      "APP_DB_PASSWORD=",
      `APP_DB_PASSWORD=${randomBytes(32).toString("hex")}`,
    );
  writeFileSync(path, content, { flag: "wx", mode: 0o600 });
}
const config = parseEnv(readFileSync(path, "utf8"));
if (!config.POSTGRES_PASSWORD?.trim() || !config.APP_DB_PASSWORD?.trim()) {
  throw new Error(
    `Defina POSTGRES_PASSWORD y APP_DB_PASSWORD en infra/.env.${mode}; se conservó el archivo existente`,
  );
}
console.log(
  `Disponible infra/.env.${mode}; se conservó la configuración existente y no se muestran credenciales.`,
);
if (mode === "coolify")
  console.log(
    "Transfiera las variables a Coolify, complete WEB_ORIGINS y configure el dominio HTTPS de web hacia 8080.",
  );
