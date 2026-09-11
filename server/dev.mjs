import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { apiHandler } from "./proxy.mjs";
import { providerRuntime } from "./provider-config.mjs";

try {
  process.loadEnvFile?.();
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../dist",
);
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 4173);
const local = ["127.0.0.1", "localhost", "::1"].includes(host);
const token = process.env.ROAM_ACCESS_TOKEN || randomBytes(24).toString("hex");
if (!local && !process.env.ROAM_ACCESS_TOKEN)
  throw new Error("公开绑定需要配置 ROAM_ACCESS_TOKEN，或保持 HOST=127.0.0.1");
if (!local && !process.env.ROAM_ALLOWED_API_HOSTS)
  throw new Error(
    "公开绑定还需要配置 ROAM_ALLOWED_API_HOSTS，限制可调用的供应商域名",
  );
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".zip": "application/zip",
  ".md": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};
const server = http.createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  if (local) {
    try {
      const incoming = new URL(`http://${req.headers.host}`).hostname;
      if (!["localhost", "127.0.0.1", "[::1]"].includes(incoming)) {
        res.writeHead(403);
        res.end("Host not allowed");
        return;
      }
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }
  }
  const origin = req.headers.origin;
  if (
    origin &&
    origin !== `http://${req.headers.host}` &&
    origin !== `https://${req.headers.host}`
  ) {
    res.writeHead(403);
    res.end("Origin not allowed");
    return;
  }
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/api/runtime") {
      if (req.method !== "GET") {
        res.writeHead(405);
        res.end();
        return;
      }
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          proxy: true,
          local,
          csrfToken: local ? token : null,
          ...providerRuntime(),
        }),
      );
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      if (req.headers["x-roam-token"] !== token) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "代理访问令牌缺失或错误" }));
        return;
      }
      await apiHandler(req, res, url);
      return;
    }
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405);
      res.end();
      return;
    }
    const requested = decodeURIComponent(url.pathname);
    const file = path.resolve(
      root,
      `.${requested === "/" ? "/index.html" : requested}`,
    );
    if (file !== root && !file.startsWith(root + path.sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    const info = await stat(file);
    if (!info.isFile())
      throw Object.assign(new Error("not found"), { code: "ENOENT" });
    res.setHeader(
      "Content-Type",
      types[path.extname(file)] || "application/octet-stream",
    );
    res.setHeader(
      "Cache-Control",
      path.extname(file) === ".html" ? "no-cache" : "public, max-age=0",
    );
    res.writeHead(200);
    res.end(req.method === "HEAD" ? undefined : await readFile(file));
  } catch (error) {
    res.writeHead(error.code === "ENOENT" ? 404 : 500, {
      "Content-Type": "text/plain; charset=utf-8",
    });
    res.end(error.code === "ENOENT" ? "Not found" : "Request failed");
  }
});
server.listen(port, host, () =>
  console.log(`Local: http://${host}:${server.address().port}/`),
);
process.on("SIGINT", () => server.close(() => process.exit(0)));
process.on("SIGTERM", () => server.close(() => process.exit(0)));
