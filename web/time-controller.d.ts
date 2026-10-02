export const BASE_SIM_SECONDS_PER_REAL_SECOND: 60;
export const TIME_SPEEDS: readonly [1, 2, 4, 8, 16, 32];

export function normalizeTimeSpeed(value: unknown): 1 | 2 | 4 | 8 | 16 | 32;

export function scaledElapsedSeconds(
  elapsedMs: number,
  speed: number
): number;

export function formatSimulationClock(
  value: number,
  withSeconds?: boolean
): string;

export interface RealTimeControllerSnapshot {
  readonly playing: boolean;
  readonly speed: 1 | 2 | 4 | 8 | 16 | 32;
  readonly pendingSimSeconds: number;
}

export interface RealTimeControllerOptions {
  readonly advance: (seconds: number) => Promise<unknown> | unknown;
  readonly preview: (pendingSeconds: number) => void;
  readonly onStateChange?: (state: RealTimeControllerSnapshot) => void;
  readonly initialSpeed?: number;
  readonly flushIntervalMs?: number;
}

export class RealTimeController {
  constructor(options: RealTimeControllerOptions);
  start(): void;
  destroy(): void;
  snapshot(): RealTimeControllerSnapshot;
  setSpeed(speed: number): void;
  setPlaying(playing: boolean): void;
  toggle(): void;
  resetFrameClock(): void;
  discardFraction(): void;
  flushNow(): Promise<void>;
  pauseAndFlush(): Promise<void>;
}
