import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

async function loadTimeController() {
  const source = readFileSync(resolve("web/time-controller.js"), "utf8");
  return import("data:text/javascript;charset=utf-8," + encodeURIComponent(source));
}

test("realtime clock exposes exactly the optimized speed multipliers", async () => {
  const {
    BASE_SIM_SECONDS_PER_REAL_SECOND,
    TIME_SPEEDS,
    normalizeTimeSpeed
  } = await loadTimeController();
  assert.equal(BASE_SIM_SECONDS_PER_REAL_SECOND, 60);
  assert.deepEqual(TIME_SPEEDS, [1, 2, 4, 8, 16, 32]);
  assert.equal(normalizeTimeSpeed(4), 4);
  assert.equal(normalizeTimeSpeed("16"), 16);
  assert.equal(normalizeTimeSpeed("32"), 32);
  assert.equal(normalizeTimeSpeed(3), 1);
});

test("elapsed wall time is scaled deterministically without one request per simulated second", async () => {
  const { scaledElapsedSeconds } = await loadTimeController();
  assert.equal(scaledElapsedSeconds(1000, 1), 60);
  assert.equal(scaledElapsedSeconds(1000, 2), 120);
  assert.equal(scaledElapsedSeconds(1000, 16), 960);
  assert.equal(scaledElapsedSeconds(1000, 32), 1920);
  assert.equal(scaledElapsedSeconds(750, 8), 360);
});

test("HUD replaces manual jumps with pause and x1-x32 game-speed controls", () => {
  const html = readFileSync(resolve("web/index.html"), "utf8");
  const app = readFileSync(resolve("web/app.js"), "utf8");
  const css = readFileSync(resolve("web/styles.css"), "utf8");

  assert.match(html, /id="time-toggle"/);
  for (const speed of [1, 2, 4, 8, 16, 32]) {
    assert.match(html, new RegExp(`data-time-speed="${speed}"`));
  }
  assert.doesNotMatch(html, /\+5 min|\+15 min|\+1 h/);
  assert.match(app, /new RealTimeController/);
  assert.match(app, /toggleRealtimePlayback/);
  assert.match(app, /document\.visibilityState === "hidden"/);
  assert.match(app, /30000/);
  assert.match(css, /speed-selector/);
  assert.doesNotMatch(html, /Temps réel/);
  assert.doesNotMatch(html, /id="time-status"/);
  assert.doesNotMatch(css, /time-live-dot|time-status/);
  assert.match(app, /clock\(obs\.simTimeSec, true\)/);
});

test("realtime advances use one serialized mutation queue and skip per-tick autosave", () => {
  const app = readFileSync(resolve("web/app.js"), "utf8");
  assert.match(app, /mutationQueue = Promise\.resolve\(\)/);
  assert.match(app, /enqueueIntent/);
  assert.match(app, /autosave:false, quiet:true/);
  assert.match(app, /realtimeDirty = true/);
});

test("pause delegates to the exact pause-and-flush controller path", () => {
  const app = readFileSync(resolve("web/app.js"), "utf8");
  const controller = readFileSync(resolve("web/time-controller.js"), "utf8");
  assert.match(app, /await realtimeController\.pauseAndFlush\(\)/);
  assert.doesNotMatch(
    app.slice(app.indexOf("async function toggleRealtimePlayback"), app.indexOf("async function advanceRealtime")),
    /discardFraction/
  );
  assert.match(controller, /async pauseAndFlush\(\)/);
  assert.match(controller, /this\.setPlaying\(false\)/);
  assert.match(controller, /await this\.flushNow\(\)/);
});


test("main simulation clock exposes seconds while x1 advances one simulated minute per real second", async () => {
  const app = readFileSync(resolve("web/app.js"), "utf8");
  const { formatSimulationClock } = await loadTimeController();
  assert.equal(formatSimulationClock(1, true), "J1 00:00:01");
  assert.equal(formatSimulationClock(60, true), "J1 00:01:00");
  assert.match(app, /clock\(previewSec, true\)/);
  assert.match(app, /clock\(envelope\.save\.payload\.simTimeSec, true\)/);
});


test("x1 game pace is intentionally faster than wall clock without increasing request cadence", async () => {
  const {
    BASE_SIM_SECONDS_PER_REAL_SECOND,
    scaledElapsedSeconds
  } = await loadTimeController();

  assert.equal(BASE_SIM_SECONDS_PER_REAL_SECOND, 60);
  assert.equal(scaledElapsedSeconds(1000, 1), 60);
  assert.equal(scaledElapsedSeconds(750, 32), 1440);

  const controller = readFileSync(resolve("web/time-controller.js"), "utf8");
  assert.match(controller, /flushIntervalMs = 750/);
});


test("simulation clock rolls over to J2 and J3 instead of displaying J1 24:00", async () => {
  const { formatSimulationClock } = await loadTimeController();
  assert.equal(formatSimulationClock(86_399, true), "J1 23:59:59");
  assert.equal(formatSimulationClock(86_400, true), "J2 00:00:00");
  assert.equal(formatSimulationClock(90_061, true), "J2 01:01:01");
  assert.equal(formatSimulationClock(172_800, true), "J3 00:00:00");
});

test("pause waits for an in-flight advance then flushes queued simulated time without loss", async () => {
  const { RealTimeController } = await loadTimeController();
  const calls: number[] = [];
  let releaseFirst: () => void = () => {};
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });

  const controller = new RealTimeController({
    advance: async (seconds: number) => {
      calls.push(seconds);
      if (calls.length === 1) await firstGate;
    },
    preview: () => {}
  });

  controller.pendingSimSeconds = 60;
  const firstFlush = controller.flushNow();
  await Promise.resolve();
  assert.deepEqual(calls, [60]);

  controller.pendingSimSeconds += 30;
  const pause = controller.pauseAndFlush();
  assert.equal(controller.snapshot().playing, false);

  let pauseResolved = false;
  void pause.then(() => { pauseResolved = true; });
  await Promise.resolve();
  assert.equal(pauseResolved, false);
  assert.deepEqual(calls, [60]);

  releaseFirst();
  await Promise.all([firstFlush, pause]);

  assert.deepEqual(calls, [60, 30]);
  assert.equal(controller.snapshot().pendingSimSeconds, 0);
});

test("pause preserves fractional simulated time instead of discarding it", async () => {
  const { RealTimeController } = await loadTimeController();
  const controller = new RealTimeController({
    advance: async () => {},
    preview: () => {}
  });
  controller.pendingSimSeconds = 0.75;
  await controller.pauseAndFlush();
  assert.equal(controller.snapshot().pendingSimSeconds, 0.75);
});
