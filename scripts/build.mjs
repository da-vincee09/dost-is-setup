import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(".");
const dist = join(root, "dist");

for (const file of ["index.html", "favicon.svg", "src/app.js", "src/styles.css"]) {
  if (!existsSync(join(root, file))) {
    throw new Error(`Missing required frontend file: ${file}`);
  }
}

const checks = [
  "src/app.js",
  "src/components.js",
  "src/referenceData.js",
  "src/repository.js",
  "src/services.js",
  "src/status.js",
  "src/utils.js",
  "server/api.mjs",
  "server/db.mjs",
  "server/defaultState.mjs"
];
for (const file of checks) {
  const result = spawnSync(process.execPath, ["--check", join(root, file)], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}

if (existsSync(dist)) {
  const resolvedDist = resolve(dist);
  if (!resolvedDist.startsWith(root)) throw new Error("Refusing to clear a dist folder outside the workspace.");
  rmSync(dist, { recursive: true, force: true });
}
mkdirSync(dist, { recursive: true });
cpSync(join(root, "index.html"), join(dist, "index.html"));
cpSync(join(root, "favicon.svg"), join(dist, "favicon.svg"));
cpSync(join(root, "src"), join(dist, "src"), { recursive: true });

function sizeOf(folder) {
  return readdirSync(folder).reduce((sum, entry) => {
    const path = join(folder, entry);
    const stats = statSync(path);
    return sum + (stats.isDirectory() ? sizeOf(path) : stats.size);
  }, 0);
}

console.log(`Static frontend build created in dist (${sizeOf(dist)} bytes).`);
