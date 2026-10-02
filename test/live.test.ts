import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("live runtime uses only a basic Node image and mounted source", () => {
  const deployment = readFileSync(resolve("deployment.yaml"), "utf8");
  const kustomization = readFileSync(resolve("kustomization.yaml"), "utf8");

  assert.match(deployment, /namespace: nukegrid/);
  assert.match(deployment, /replicas: 1/);
  assert.match(deployment, /image: node:24-alpine/);
  assert.match(deployment, /--experimental-transform-types/);
  assert.match(deployment, /--experimental-loader=\/app\/runtime\/loader\.mjs/);
  assert.match(deployment, /\/app\/runtime\/start\.mjs/);
  assert.match(deployment, /configMap:\n\s+name: nukegrid-runtime/);

  assert.doesNotMatch(deployment, /initContainers:/);
  assert.doesNotMatch(deployment, /github-token|GITHUB_TOKEN|npm install|npm run build|git clone|ghcr\.io\/djayzone\/nukegrid/);
  assert.doesNotMatch(kustomization, /runtime\.Dockerfile|github-token/);
  assert.match(kustomization, /configMapGenerator:/);
});

test("runtime ConfigMap carries server, engine source and web UI", () => {
  const kustomization = readFileSync(resolve("kustomization.yaml"), "utf8");
  for (const expected of [
    "src/playable/server.ts",
    "src/playable/session.ts",
    "src/sim/engine.ts",
    "src/persistence/save.ts",
    "web/index.html",
    "web/app.js",
    "web/styles.css",
    "runtime/loader.mjs",
    "runtime/start.mjs"
  ]) {
    assert.ok(kustomization.includes(expected), expected);
  }
});

test("public HTTPS remains on the NukeGrid service", () => {
  const service = readFileSync(resolve("service.yaml"), "utf8");
  const ingress = readFileSync(resolve("ingress.yaml"), "utf8");
  assert.match(service, /namespace: nukegrid/);
  assert.match(service, /type: ClusterIP/);
  assert.match(ingress, /namespace: nukegrid/);
  assert.match(ingress, /nukegrid\.lab\.djayzone\.com/);
  assert.match(ingress, /letsencrypt-production/);
  assert.match(ingress, /service:\n\s+name: nukegrid/);
  assert.doesNotMatch(ingress, /nukegrid-public/);
});

test("live browser sessions stay isolated by a durable per-browser id", () => {
  const server = readFileSync(resolve("src/playable/server.ts"), "utf8");
  const app = readFileSync(resolve("web/app.js"), "utf8");
  assert.match(server, /x-nukegrid-session/);
  assert.match(server, /new Map<string, PlayableSession>/);
  assert.match(app, /crypto\.randomUUID/);
  assert.match(app, /localStorage\.getItem/);
  assert.match(app, /x-nukegrid-session/);
});


test("basic-image start wrapper explicitly listens instead of relying on module entry detection", () => {
  const start = readFileSync(resolve("runtime/start.mjs"), "utf8");
  assert.match(start, /createPlayableServer/);
  assert.match(start, /server\.listen\(port, host/);
  assert.match(start, /NUKEGRID_HOST/);
  assert.match(start, /NUKEGRID_PORT/);
});


test("realtime browser module is both mounted and served by the basic-image runtime", () => {
  const deployment = readFileSync(resolve("deployment.yaml"), "utf8");
  const server = readFileSync(resolve("src/playable/server.ts"), "utf8");
  const kustomization = readFileSync(resolve("kustomization.yaml"), "utf8");

  assert.match(kustomization, /web__time-controller\.js=web\/time-controller\.js/);
  assert.match(deployment, /key: web__time-controller\.js\n\s+path: web\/time-controller\.js/);
  assert.match(server, /"\/time-controller\.js": "time-controller\.js"/);
});
