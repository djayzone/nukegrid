import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../src/", import.meta.url);
const forbidden = [
  ["Math.random(", "business randomness must use the versioned PRNG"],
  ["Date.now(", "simulation must not depend on wall-clock time"],
  ["new Date(", "simulation must not depend on wall-clock time"],
  ["document.", "simulation/contracts must not depend on the DOM"],
  ["window.", "simulation/contracts must not depend on the DOM"]
];

async function walk(url) {
  const entries = await readdir(url, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = new URL(entry.name + (entry.isDirectory() ? "/" : ""), url);
    if (entry.isDirectory()) files.push(...await walk(child));
    else if (entry.name.endsWith(".ts")) files.push(child);
  }
  return files;
}

let failed = false;
for (const file of await walk(root)) {
  const text = await readFile(file, "utf8");
  for (const [needle, reason] of forbidden) {
    if (text.includes(needle)) {
      failed = true;
      console.error(`${file.pathname}: forbidden "${needle}" — ${reason}`);
    }
  }
}
if (failed) process.exit(1);
console.log("nukegrid-lint: PASS");
