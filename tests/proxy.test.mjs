import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";

test("local server protects the proxy and forwards a mock provider request", async () => {
  let received;
  const upstream = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    received = {
      authorization: req.headers.authorization,
      body: JSON.parse(Buffer.concat(chunks).toString()),
    };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({ choices: [{ message: { content: "mock-response" } }] }),
    );
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const child = spawn(process.execPath, ["server/dev.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: "0",
      ROAM_TEXT_KEY: "",
      ROAM_IMAGE_KEY: "",
      ROAM_ACCESS_TOKEN: "",
      ROAM_ALLOWED_API_HOSTS: "",
      ROAM_ALLOW_LOCAL_API: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    const address = await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Local test server did not start")),
        5000,
      );
      let out = "";
      child.stdout.on("data", (data) => {
        out += data;
        const match = out.match(/Local: (http:\/\/[^\s]+)/);
        if (match) {
          clearTimeout(timeout);
          resolve(match[1]);
        }
      });
      child.once("exit", () => {
        clearTimeout(timeout);
        reject(new Error("Local test server exited"));
      });
    });
    const page = await fetch(address, { method: "HEAD" });
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-type"), /text\/html/);
    const runtime = await fetch(new URL("api/runtime", address)).then((r) =>
      r.json(),
    );
    assert.equal(runtime.proxy, true);
    assert.ok(runtime.csrfToken);
    const unauthenticated = await fetch(new URL("api/text", address), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(unauthenticated.status, 401);
    const foreign = await fetch(new URL("api/runtime", address), {
      headers: { Origin: "https://untrusted.example" },
    });
    assert.equal(foreign.status, 403);
    const result = await fetch(new URL("api/text", address), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Roam-Token": runtime.csrfToken,
      },
      body: JSON.stringify({
        url: `http://127.0.0.1:${upstream.address().port}/v1/chat/completions`,
        key: "mock-key-only",
        payload: {
          model: "mock-model",
          messages: [{ role: "user", content: "test" }],
        },
      }),
    });
    assert.equal(result.status, 200);
    assert.equal(
      (await result.json()).choices[0].message.content,
      "mock-response",
    );
    assert.equal(received.authorization, "Bearer mock-key-only");
    assert.equal(received.body.model, "mock-model");
    const invalid = await fetch(new URL("api/text", address), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Roam-Token": runtime.csrfToken,
      },
      body: JSON.stringify({
        url: "file:///etc/passwd",
        key: "mock",
        payload: { model: "mock" },
      }),
    });
    assert.equal(invalid.status, 400);
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => upstream.close(resolve));
  }
});
