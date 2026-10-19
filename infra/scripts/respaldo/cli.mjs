import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { OperationError } from "./core.mjs";
import { backup, retentionPlan, verifyRestore } from "./operations.mjs";

const environment = new URL("../../../apps/api/.env", import.meta.url);
try {
  if (existsSync(environment)) loadEnvFile(environment);
  const operations = {
    backup,
    verify: verifyRestore,
    retention: retentionPlan,
  };
  const options = process.argv.slice(2);
  if (options.length !== 1 || !Object.hasOwn(operations, options[0]))
    throw new OperationError(
      "Use pnpm db:backup, pnpm db:restore:verify o pnpm db:backup:retention",
    );
  const result = await operations[options[0]]();
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(
    error instanceof OperationError
      ? error.message
      : "No se pudo completar la operación; revise la configuración y el registro de respaldos",
  );
  process.exitCode = 1;
}
