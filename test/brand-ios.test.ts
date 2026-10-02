import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("brand v3 uses the approved warm amber/copper/cream palette", () => {
  const css = readFileSync(resolve("web/styles.css"), "utf8");
  for (const token of ["#3b2819","#5a3d24","#ffb134","#ffd365","#e58a3c","#f4e8d7"]) {
    assert.ok(css.toLowerCase().includes(token), token);
  }
  assert.doesNotMatch(css, /--blue:\s*#5fb3ff/);
});

test("NukeGrid ships unique inline vector branding and control icons", () => {
  const html = readFileSync(resolve("web/index.html"), "utf8");
  for (const symbol of [
    "ng-brand","ng-shield","ng-save","ng-export","ng-import",
    "ng-treasury","ng-bolt","ng-chart","ng-radiation","ng-reactor",
    "ng-gauge","ng-wrench","ng-settings","ng-clock"
  ]) {
    assert.match(html, new RegExp(`id="${symbol}"`));
  }
  assert.match(html, /class="brand-mark"/);
  assert.match(html, /NUKE/);
  assert.match(html, /GRID/);
});

test("iOS shell handles safe areas and minimum touch targets", () => {
  const html = readFileSync(resolve("web/index.html"), "utf8");
  const css = readFileSync(resolve("web/styles.css"), "utf8");

  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /apple-mobile-web-app-capable/);
  assert.match(css, /env\(safe-area-inset-top\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /min-height:44px/);
  assert.match(css, /-webkit-overflow-scrolling:touch/);
  assert.match(css, /overflow-x:hidden/);
  assert.match(css, /@media\s*\(max-width:767px\)/);
});

test("mobile layout becomes one-dimensional instead of squeezing desktop columns", () => {
  const css = readFileSync(resolve("web/styles.css"), "utf8");
  assert.match(css, /@media\(max-width:767px\)[\s\S]*?\.shell\{[\s\S]*?display:flex[\s\S]*?flex-direction:column/);
  assert.match(css, /\.assets\{order:1\}/);
  assert.match(css, /\.inspector\{order:2\}/);
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
});

test("dynamic cards use bespoke reactor visuals and NukeGrid icons", () => {
  const app = readFileSync(resolve("web/app.js"), "utf8");
  assert.match(app, /function ngIcon/);
  assert.match(app, /function reactorVisual/);
  assert.match(app, /reactor-thumb/);
  assert.match(app, /unit-inspector-head/);
  assert.match(app, /primary-command/);
});
