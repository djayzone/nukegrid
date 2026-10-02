import { PRNG_VERSION } from "../contracts/versions.js";

export interface SerializedPrngState {
  readonly version: typeof PRNG_VERSION;
  readonly state: number;
}

export class DeterministicPrng {
  readonly version = PRNG_VERSION;
  private state: number;

  constructor(seedOrState: number | SerializedPrngState) {
    const value = typeof seedOrState === "number" ? seedOrState : seedOrState.state;
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
      throw new Error("PRNG_STATE_INVALID");
    }
    this.state = value === 0 ? 0x6d2b79f5 : value >>> 0;
  }

  nextUint32(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state;
  }

  nextFloat01(): number {
    return this.nextUint32() / 0x100000000;
  }

  serialize(): SerializedPrngState {
    return { version: this.version, state: this.state };
  }

  static restore(serialized: SerializedPrngState): DeterministicPrng {
    if (serialized.version !== PRNG_VERSION) throw new Error("PRNG_VERSION_UNSUPPORTED");
    return new DeterministicPrng(serialized);
  }
}
