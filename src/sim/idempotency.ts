import type { CommandId, CommandResult, GameCommand } from "../contracts/commands.js";

export class CommandLedger {
  private readonly results = new Map<CommandId, CommandResult>();

  lookup(command: Pick<GameCommand, "id">): CommandResult | undefined {
    return this.results.get(command.id);
  }

  remember(command: Pick<GameCommand, "id">, result: CommandResult): void {
    if (this.results.has(command.id)) throw new Error("COMMAND_DUPLICATE_ID");
    this.results.set(command.id, result);
  }

  has(commandId: CommandId): boolean {
    return this.results.has(commandId);
  }
}
