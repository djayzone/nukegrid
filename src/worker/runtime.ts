import { assertIntegerSimSeconds, type SimSeconds } from "../contracts/units.js";
import { DeterministicEngine } from "../sim/engine.js";
import type { EngineWorkerRequest, EngineWorkerResponse } from "./protocol.js";

export type WorkerResponseSink = (response: EngineWorkerResponse) => void;
export type YieldControl = () => Promise<void>;

function defaultYieldControl(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export class EngineWorkerRuntime {
  private readonly cancelledRequests = new Set<string>();

  constructor(
    private readonly engine: DeterministicEngine,
    private readonly emit: WorkerResponseSink,
    private readonly yieldControl: YieldControl = defaultYieldControl
  ) {}

  async handle(request: EngineWorkerRequest): Promise<void> {
    try {
      switch (request.type) {
        case "submit":
          this.emit({
            type: "command-result",
            requestId: request.requestId,
            result: this.engine.submit(request.command)
          });
          return;
        case "snapshot":
          this.emit({
            type: "snapshot",
            requestId: request.requestId,
            snapshot: this.engine.snapshot()
          });
          return;
        case "cancel":
          this.cancelledRequests.add(request.targetRequestId);
          this.emit({
            type: "cancel-ack",
            requestId: request.requestId,
            targetRequestId: request.targetRequestId
          });
          return;
        case "advance":
          await this.advanceChunked(request.requestId, request.untilSec, request.chunkSec ?? 300);
          return;
      }
    } catch (error) {
      this.emit({
        type: "error",
        requestId: request.requestId,
        code: error instanceof Error ? error.message : "ENGINE_WORKER_UNKNOWN_ERROR"
      });
    }
  }

  private async advanceChunked(
    requestId: string,
    untilSec: SimSeconds,
    chunkSec: SimSeconds
  ): Promise<void> {
    assertIntegerSimSeconds(untilSec);
    assertIntegerSimSeconds(chunkSec);
    if (chunkSec === 0) throw new Error("ENGINE_WORKER_CHUNK_MUST_BE_POSITIVE");
    if (untilSec < this.engine.simTimeSec) throw new Error("ENGINE_ADVANCE_TARGET_PAST");

    while (this.engine.simTimeSec < untilSec) {
      if (this.cancelledRequests.delete(requestId)) {
        this.emit({
          type: "advance-complete",
          requestId,
          simTimeSec: this.engine.simTimeSec,
          reason: "cancelled"
        });
        return;
      }

      const nextTarget = Math.min(untilSec, this.engine.simTimeSec + chunkSec);
      const result = this.engine.advanceUntil(nextTarget);
      this.emit({
        type: "advance-progress",
        requestId,
        simTimeSec: this.engine.simTimeSec
      });

      if (result.reason === "important-event") {
        this.emit({
          type: "advance-complete",
          requestId,
          simTimeSec: result.simTimeSec,
          reason: result.reason,
          ...(result.eventId ? { eventId: result.eventId } : {})
        });
        return;
      }

      if (this.engine.simTimeSec < untilSec) await this.yieldControl();
    }

    this.cancelledRequests.delete(requestId);
    this.emit({
      type: "advance-complete",
      requestId,
      simTimeSec: this.engine.simTimeSec,
      reason: "target-reached"
    });
  }
}

export interface WorkerPort {
  onmessage: ((event: { readonly data: EngineWorkerRequest }) => void) | null;
  postMessage(response: EngineWorkerResponse): void;
}

export function attachEngineWorker(
  port: WorkerPort,
  engine: DeterministicEngine,
  yieldControl?: YieldControl
): EngineWorkerRuntime {
  const runtime = new EngineWorkerRuntime(
    engine,
    (response) => port.postMessage(response),
    yieldControl ?? defaultYieldControl
  );
  port.onmessage = (event) => {
    void runtime.handle(event.data);
  };
  return runtime;
}
