import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "node_modules", "@electric-sql", "pglite", "dist");
const target = join(root, ".output", "server", "_libs");

await mkdir(target, { recursive: true });
for (const asset of ["pglite.data", "pglite.wasm", "initdb.wasm"]) {
  await copyFile(join(source, asset), join(target, asset));
}

console.log("[build] copied PGlite runtime assets");
