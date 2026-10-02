import { assertIntegerSimSeconds, type SimSeconds } from "../contracts/units.js";

export interface TimedQueueEntry<T> {
  readonly atSec: SimSeconds;
  readonly id: string;
  readonly value: T;
}

function compareEntries<T>(left: TimedQueueEntry<T>, right: TimedQueueEntry<T>): number {
  if (left.atSec !== right.atSec) return left.atSec - right.atSec;
  return left.id.localeCompare(right.id);
}

export class DeterministicQueue<T> {
  private entries: TimedQueueEntry<T>[] = [];

  constructor(initial: readonly TimedQueueEntry<T>[] = []) {
    for (const entry of initial) this.push(entry);
  }

  push(entry: TimedQueueEntry<T>): void {
    assertIntegerSimSeconds(entry.atSec);
    if (!entry.id) throw new Error("QUEUE_ID_REQUIRED");
    if (this.entries.some((candidate) => candidate.id === entry.id)) {
      throw new Error("QUEUE_DUPLICATE_ID");
    }
    this.entries.push({ ...entry });
    this.entries.sort(compareEntries);
  }

  peek(): TimedQueueEntry<T> | undefined {
    return this.entries[0];
  }

  drainAt(atSec: SimSeconds): readonly TimedQueueEntry<T>[] {
    assertIntegerSimSeconds(atSec);
    const due: TimedQueueEntry<T>[] = [];
    const future: TimedQueueEntry<T>[] = [];
    for (const entry of this.entries) {
      (entry.atSec === atSec ? due : future).push(entry);
    }
    this.entries = future;
    return due;
  }

  snapshot(): readonly TimedQueueEntry<T>[] {
    return this.entries.map((entry) => ({ ...entry }));
  }
}
