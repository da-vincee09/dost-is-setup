import { spawnSync } from "node:child_process";

const files = [
  "src/app.js",
  "src/components.js",
  "src/referenceData.js",
  "src/repository.js",
  "src/services.js",
  "src/status.js",
  "src/utils.js",
  "src/models.js",
  "server/api.mjs",
  "server/db.mjs",
  "server/defaultState.mjs"
];

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log("Type-oriented syntax checks passed. This zero-install frontend uses JSDoc models instead of a TypeScript compiler.");
