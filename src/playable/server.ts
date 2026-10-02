import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { measureSave } from "../persistence/save.js";
import { parsePlayableIntent, PlayableSession } from "./session.js";

const webRoot = resolve(process.cwd(), "web");
const staticFiles: Readonly<Record<string, string>> = {
  "/": "index.html",
  "/index.html": "index.html",
  "/app.js": "app.js",
  "/time-controller.js": "time-controller.js",
  "/persistence.js": "persistence.js",
  "/styles.css": "styles.css"
};

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(value));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  let body = "";
  for await (const chunk of request) {
    body += String(chunk);
    if (body.length > 2 * 1024 * 1024) throw new Error("REQUEST_TOO_LARGE");
  }
  return body.length === 0 ? null : JSON.parse(body);
}

function contentType(path: string): string {
  switch (extname(path)) {
    case ".html": return "text/html; charset=utf-8";
    case ".js": return "text/javascript; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    default: return "application/octet-stream";
  }
}

export function createPlayableServer(defaultSession = new PlayableSession()) {
  const sessions = new Map<string, PlayableSession>();

  function sessionFor(request: IncomingMessage): PlayableSession {
    const raw = request.headers["x-nukegrid-session"];
    const key = typeof raw === "string" && /^[a-zA-Z0-9._:-]{8,128}$/.test(raw)
      ? raw
      : "default";
    if (key === "default") return defaultSession;
    const existing = sessions.get(key);
    if (existing) return existing;
    if (sessions.size >= 256) {
      const oldest = sessions.keys().next().value;
      if (oldest) sessions.delete(oldest);
    }
    const created = new PlayableSession();
    sessions.set(key, created);
    return created;
  }

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (request.method === "GET" && url.pathname === "/healthz") {
        json(response, 200, { ok: true });
        return;
      }
      const session = sessionFor(request);
      if (request.method === "GET" && url.pathname === "/api/state") {
        json(response, 200, session.state());
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/action") {
        const intent = parsePlayableIntent(await readJson(request));
        if (!intent) {
          json(response, 400, {
            error: "UI_INTENT_INVALID",
            state: session.state()
          });
          return;
        }
        json(response, 200, session.perform(intent));
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/save") {
        const save = session.exportSave();
        json(response, 200, { save, metrics: measureSave(save) });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/load") {
        const body = await readJson(request);
        const candidate = body && typeof body === "object" && "save" in body
          ? (body as { readonly save: unknown }).save
          : body;
        const restored = session.restoreSave(candidate);
        if (!restored.ok) {
          json(response, 422, {
            error: restored.code,
            issues: restored.issues ?? [],
            state: session.state()
          });
          return;
        }
        const save = session.exportSave();
        json(response, 200, {
          state: session.state(),
          metrics: measureSave(save)
        });
        return;
      }

      if (request.method === "GET") {
        const file = staticFiles[url.pathname];
        if (file) {
          const path = resolve(webRoot, file);
          const content = await readFile(path);
          response.writeHead(200, {
            "content-type": contentType(path),
            "cache-control": "no-store"
          });
          response.end(content);
          return;
        }
      }

      json(response, 404, { error: "NOT_FOUND" });
    } catch (error) {
      json(response, 500, {
        error: "PLAYABLE_SERVER_ERROR",
        message: error instanceof Error ? error.message : "unknown"
      });
    }
  });
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(resolve(entry)).href) {
  const port = Number(process.env.NUKEGRID_PORT ?? 4176);
  const host = process.env.NUKEGRID_HOST ?? "127.0.0.1";
  const server = createPlayableServer();
  server.listen(port, host, () => {
    console.log(`NukeGrid playable UI: http://${host}:${port}`);
  });
}
