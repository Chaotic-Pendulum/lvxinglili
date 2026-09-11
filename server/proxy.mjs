import { providerKey } from "./provider-config.mjs";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export function isPrivateAddress(address) {
  let a = address.toLowerCase();
  if (a.startsWith("::ffff:")) {
    a = a.slice(7);
    if (a.includes(":")) {
      const [hi, lo] = a.split(":").map((x) => parseInt(x, 16));
      a = [hi >> 8, hi & 255, lo >> 8, lo & 255].join(".");
    }
  }
  if (
    a === "::1" ||
    a === "::" ||
    /^f[cd]/.test(a) ||
    /^fe[89ab]/.test(a) ||
    a.startsWith("ff")
  )
    return true;
  const p = a.split(".").map(Number);
  return (
    p.length === 4 &&
    (p[0] === 0 ||
      p[0] === 10 ||
      p[0] === 127 ||
      (p[0] === 169 && p[1] === 254) ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 192 && p[1] === 168) ||
      p[0] >= 224 ||
      (p[0] === 100 && p[1] >= 64 && p[1] <= 127))
  );
}
export async function checkEndpoint(value) {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("API 地址必须为 HTTP(S)，不可在地址中包含密钥");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const allowed = (process.env.ROAM_ALLOWED_API_HOSTS || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  if (allowed.length && !allowed.includes(host))
    throw new Error("该 API 域名不在 ROAM_ALLOWED_API_HOSTS 内");
  const addresses = isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true });
  if (!addresses.length) throw new Error("API 域名无法解析");
  if (
    process.env.ROAM_ALLOW_LOCAL_API !== "1" &&
    addresses.some((x) => isPrivateAddress(x.address))
  )
    throw new Error(
      "默认禁止代理访问内网地址；本地模型可显式配置 ROAM_ALLOW_LOCAL_API=1",
    );
  return url;
}
async function body(req) {
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 16 * 1024 * 1024) throw new Error("请求超过16MB");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function json(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}
export async function apiHandler(req, res, url) {
  if (req.method !== "POST") {
    json(res, 405, { error: "仅支持 POST" });
    return;
  }
  if (!["/api/text", "/api/image"].includes(url.pathname)) {
    json(res, 404, { error: "未知接口" });
    return;
  }
  try {
    const data = await body(req),
      type = url.pathname.endsWith("/text") ? "text" : "image";
    const endpoint = await checkEndpoint(data.url);
    const key = providerKey(type,endpoint,data.key);
    if (typeof key !== "string" || !key.trim())
      throw new Error("尚未配置 API 密钥");
    const payload = data.payload;
    if (!payload || typeof payload.model !== "string" || !payload.model.trim())
      throw new Error("尚未配置模型名称");
    let requestBody,
      headers = { Authorization: `Bearer ${key}` };
    if (type === "image" && data.reference && new URL(endpoint).hostname !== "openrouter.ai") {
      const match = String(data.reference).match(
        /^data:(image\/(?:png|jpeg|webp));base64,([a-zA-Z0-9+/=\s]+)$/,
      );
      if (!match) throw new Error("角色参考图需要是 PNG/JPG/WebP");
      const form = new FormData();
      for (const [k, v] of Object.entries(payload))
        if (v !== undefined && v !== null) form.set(k, String(v));
      form.set(
        "image",
        new Blob([Buffer.from(match[2], "base64")], { type: match[1] }),
        "character.png",
      );
      requestBody = form;
    } else {
      headers["Content-Type"] = "application/json";
      requestBody = JSON.stringify(payload);
    }
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers,
      body: requestBody,
      redirect: "error",
      signal: AbortSignal.timeout(type === "image" ? 180000 : 60000),
    });
    const raw = await upstream.text();
    if (raw.length > 40 * 1024 * 1024) throw new Error("模型响应过大");
    let result;
    try {
      result = JSON.parse(raw);
    } catch {
      throw new Error(`API 返回非 JSON 响应（HTTP ${upstream.status}）`);
    }
    if (!upstream.ok) {
      json(res, upstream.status, {
        error: String(
          result.error?.message || result.message || `HTTP ${upstream.status}`,
        ).slice(0, 500),
      });
      return;
    }
    json(res, 200, result);
  } catch (error) {
    json(res, 400, {
      error:
        error.name === "TimeoutError"
          ? "模型响应超时，请稍后手动重试"
          : String(error.message || "请求失败").slice(0, 500),
    });
  }
}
