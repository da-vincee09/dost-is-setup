import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(".");
const jsFiles = [];
const cssFiles = [];

function walk(folder) {
  for (const entry of readdirSync(folder)) {
    const path = join(folder, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) walk(path);
    else if (path.endsWith(".js") || path.endsWith(".mjs")) jsFiles.push(path);
    else if (path.endsWith(".css")) cssFiles.push(path);
  }
}

walk(join(root, "src"));
walk(join(root, "scripts"));
walk(join(root, "server"));

for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}

for (const file of cssFiles) {
  const css = readFileSync(file, "utf8");
  const opens = (css.match(/{/g) || []).length;
  const closes = (css.match(/}/g) || []).length;
  if (opens !== closes) {
    console.error(`CSS brace mismatch in ${file}: ${opens} opens, ${closes} closes`);
    process.exit(1);
  }
}

console.log(`Lint checks passed for ${jsFiles.length} JS files and ${cssFiles.length} CSS files.`);
