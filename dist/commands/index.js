export function resolveCommandUsage(command, subCommand) {
    if (typeof command.usage === 'string') {
        return command.usage;
    }
    if (Array.isArray(command.usage)) {
        return command.usage.join('\n');
    }
    if (!subCommand) {
        return Object.values(command.usage).join('\n');
    }
    return command.usage[subCommand] ?? Object.values(command.usage).join('\n');
}
import { EchoCommand } from "@/commands/echo";
import { PraiseMeCommand } from "@/commands/praise-me";
import { BindCommand } from "@/commands/bind";
import { WorkflowCreateCommand } from "@/commands/workflow-create";
import { WorkflowQueryCommand } from "@/commands/workflow-query";
import { VanillaPardonCommand } from "@/commands/vanilla-pardon";
import { VanillaShutUpCommand } from "@/commands/vanilla-shut-up";
import { CaveGetCommand } from "@/commands/cave-get";
import { CavePutCommand } from "@/commands/cave-put";
import { EchoRawCommand } from "@/commands/echo-raw";
import { AliasCommand } from "@/commands/alias";
import { VoteCommand } from "@/commands/vote";
export const commands = [
    new EchoCommand(),
    new EchoRawCommand(),
    new PraiseMeCommand(),
    new BindCommand(),
    new WorkflowCreateCommand(),
    new WorkflowQueryCommand(),
    new VanillaPardonCommand(),
    new VanillaShutUpCommand(),
    new CaveGetCommand(),
    new CavePutCommand(),
    new AliasCommand(),
    new VoteCommand()
];
