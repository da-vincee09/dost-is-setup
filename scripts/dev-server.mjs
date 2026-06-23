import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { handleApi } from "../server/api.mjs";

const root = resolve(".");
const port = Number(process.env.PORT || 4173);

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

function safePath(urlPath, base = root) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const requested = normalize(decoded === "/" ? "/index.html" : decoded);
  const full = resolve(join(base, requested));
  return full.startsWith(base) ? full : join(base, "index.html");
}

createServer(async (request, response) => {
  if ((request.url || "").startsWith("/api/")) {
    await handleApi(request, response);
    return;
  }

  const fileBase = (request.url || "").startsWith("/uploads/") ? join(root, "data") : root;
  let filePath = safePath(request.url || "/", fileBase);
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(root, "index.html");
  }
  response.writeHead(200, {
    "Content-Type": types[extname(filePath)] || "application/octet-stream",
    "Cache-Control": "no-store"
  });
  createReadStream(filePath).pipe(response);
}).listen(port, () => {
  console.log(`Frontend dev server running at http://localhost:${port}`);
});
