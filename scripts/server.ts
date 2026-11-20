import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import handler from "../api/estimate.ts";

const publicDir = join(process.cwd(), "public");

const files: Record<string, string> = {
  "/": "index.html",
  "/index.html": "index.html",
  "/styles.css": "styles.css",
  "/app.js": "app.js",
  "/favicon.svg": "favicon.svg",
};

const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  });
  res.end(body);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > 4000) throw new Error("too-large");
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function onRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (url.pathname === "/api/estimate") {
    try {
      const raw = await readBody(req);
      let status = 200;
      handler(
        { method: req.method, body: raw },
        {
          status(code) {
            status = code;
            return this;
          },
          json(payload) {
            sendJson(res, status, payload);
          },
        },
      );
    } catch (err) {
      const tooLarge = err instanceof Error && err.message === "too-large";
      sendJson(res, tooLarge ? 413 : 400, {
        error: tooLarge
          ? "That request was too large."
          : "Those details didn't come through. Check them and try again.",
      });
    }
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    sendJson(res, 405, { error: "Not found." });
    return;
  }

  const name = files[url.pathname];
  if (!name) {
    sendJson(res, 404, { error: "Not found." });
    return;
  }

  const body = await readFile(join(publicDir, name));
  res.writeHead(200, {
    "content-type": types[extname(name)] ?? "application/octet-stream",
    "content-length": body.length,
    "cache-control": "no-cache",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  });
  res.end(req.method === "HEAD" ? undefined : body);
}

export function start(port: number): Promise<Server> {
  const server = createServer((req, res) => {
    onRequest(req, res).catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : "request failed");
      if (!res.headersSent) sendJson(res, 500, { error: "Something went wrong." });
      else res.end();
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server);
    });
  });
}
