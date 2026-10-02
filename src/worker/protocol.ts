import type { CommandResult, GameCommand } from "../contracts/commands.js";
import type { SimSeconds } from "../contracts/units.js";
import type { EngineSnapshot } from "../sim/engine.js";

export type EngineWorkerRequest =
  | {
      readonly type: "submit";
      readonly requestId: string;
      readonly command: GameCommand;
    }
  | {
      readonly type: "advance";
      readonly requestId: string;
      readonly untilSec: SimSeconds;
      readonly chunkSec?: SimSeconds;
    }
  | {
      readonly type: "cancel";
      readonly requestId: string;
      readonly targetRequestId: string;
    }
  | {
      readonly type: "snapshot";
      readonly requestId: string;
    };

export type EngineWorkerResponse =
  | {
      readonly type: "command-result";
      readonly requestId: string;
      readonly result: CommandResult;
    }
  | {
      readonly type: "advance-progress";
      readonly requestId: string;
      readonly simTimeSec: SimSeconds;
    }
  | {
      readonly type: "advance-complete";
      readonly requestId: string;
      readonly simTimeSec: SimSeconds;
      readonly reason: "target-reached" | "important-event" | "cancelled";
      readonly eventId?: string;
    }
  | {
      readonly type: "cancel-ack";
      readonly requestId: string;
      readonly targetRequestId: string;
    }
  | {
      readonly type: "snapshot";
      readonly requestId: string;
      readonly snapshot: EngineSnapshot;
    }
  | {
      readonly type: "error";
      readonly requestId: string;
      readonly code: string;
    };
