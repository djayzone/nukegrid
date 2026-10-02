export const BASE_SIM_SECONDS_PER_REAL_SECOND = 60;
export const TIME_SPEEDS = Object.freeze([1, 2, 4, 8, 16, 32]);

export function normalizeTimeSpeed(value) {
  const numeric = Number(value);
  return TIME_SPEEDS.includes(numeric) ? numeric : 1;
}

export function scaledElapsedSeconds(elapsedMs, speed) {
  const safeElapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  return (safeElapsed / 1000) *
    BASE_SIM_SECONDS_PER_REAL_SECOND *
    normalizeTimeSpeed(speed);
}

export function formatSimulationClock(value, withSeconds = false) {
  const wholeSeconds = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  const day = Math.floor(wholeSeconds / 86400) + 1;
  const daySeconds = wholeSeconds % 86400;
  const hours = Math.floor(daySeconds / 3600);
  const minutes = Math.floor((daySeconds % 3600) / 60);
  const seconds = daySeconds % 60;
  const hhmm = `J${day} ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  return withSeconds
    ? `${hhmm}:${String(seconds).padStart(2, "0")}`
    : hhmm;
}

export class RealTimeController {
  constructor({
    advance,
    preview,
    onStateChange = () => {},
    initialSpeed = 1,
    flushIntervalMs = 750
  }) {
    this.advance = advance;
    this.preview = preview;
    this.onStateChange = onStateChange;
    this.speed = normalizeTimeSpeed(initialSpeed);
    this.flushIntervalMs = Math.max(250, Number(flushIntervalMs) || 750);
    this.playing = true;
    this.pendingSimSeconds = 0;
    this.lastFrameAt = null;
    this.lastFlushAt = 0;
    this.frameId = null;
    this.inFlightPromise = null;
    this.destroyed = false;
    this.boundFrame = (timestamp) => this.frame(timestamp);
  }

  start() {
    if (this.frameId !== null || this.destroyed) return;
    this.lastFrameAt = null;
    this.frameId = requestAnimationFrame(this.boundFrame);
    this.onStateChange(this.snapshot());
  }

  destroy() {
    this.destroyed = true;
    if (this.frameId !== null) cancelAnimationFrame(this.frameId);
    this.frameId = null;
  }

  snapshot() {
    return {
      playing: this.playing,
      speed: this.speed,
      pendingSimSeconds: this.pendingSimSeconds
    };
  }

  setSpeed(speed) {
    this.speed = normalizeTimeSpeed(speed);
    this.onStateChange(this.snapshot());
  }

  setPlaying(playing) {
    this.playing = Boolean(playing);
    this.lastFrameAt = null;
    this.onStateChange(this.snapshot());
  }

  toggle() {
    this.setPlaying(!this.playing);
  }

  resetFrameClock() {
    this.lastFrameAt = null;
  }

  discardFraction() {
    this.pendingSimSeconds = 0;
    this.preview(0);
  }

  async flushNow() {
    if (this.inFlightPromise) {
      await this.inFlightPromise;
    }

    const wholeSeconds = Math.floor(this.pendingSimSeconds);
    if (wholeSeconds < 1) return;

    this.pendingSimSeconds -= wholeSeconds;
    this.preview(this.pendingSimSeconds);

    const operation = (async () => {
      try {
        await this.advance(wholeSeconds);
      } catch (error) {
        this.pendingSimSeconds += wholeSeconds;
        this.preview(this.pendingSimSeconds);
        throw error;
      }
    })();

    this.inFlightPromise = operation;
    try {
      await operation;
    } finally {
      if (this.inFlightPromise === operation) {
        this.inFlightPromise = null;
      }
    }
  }

  async pauseAndFlush() {
    this.setPlaying(false);
    await this.flushNow();
  }

  frame(timestamp) {
    this.frameId = null;
    if (this.destroyed) return;

    if (this.lastFrameAt === null) {
      this.lastFrameAt = timestamp;
      this.lastFlushAt = timestamp;
    } else {
      const elapsedMs = Math.min(2000, Math.max(0, timestamp - this.lastFrameAt));
      this.lastFrameAt = timestamp;

      if (this.playing && document.visibilityState === "visible") {
        this.pendingSimSeconds += scaledElapsedSeconds(elapsedMs, this.speed);
        this.preview(this.pendingSimSeconds);

        if (
          !this.inFlightPromise &&
          this.pendingSimSeconds >= 1 &&
          timestamp - this.lastFlushAt >= this.flushIntervalMs
        ) {
          this.lastFlushAt = timestamp;
          void this.flushNow();
        }
      }
    }

    this.frameId = requestAnimationFrame(this.boundFrame);
  }
}
