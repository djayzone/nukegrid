import { assertIntegerSimSeconds, type SimSeconds } from "../contracts/units.js";

export type SimulationSpeed = 1 | 5 | 20 | 60;

export interface SimulationClockState {
  readonly paused: boolean;
  readonly speed: SimulationSpeed;
}

export class SimulationClock {
  private paused = true;
  private speed: SimulationSpeed = 1;

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  setSpeed(speed: SimulationSpeed): void {
    this.speed = speed;
  }

  state(): SimulationClockState {
    return { paused: this.paused, speed: this.speed };
  }

  budgetSimSeconds(baseQuantumSec: SimSeconds = 1): SimSeconds {
    assertIntegerSimSeconds(baseQuantumSec);
    if (baseQuantumSec === 0) throw new Error("CLOCK_QUANTUM_MUST_BE_POSITIVE");
    return this.paused ? 0 : baseQuantumSec * this.speed;
  }
}
