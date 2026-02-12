import { EchoCommand } from '@/commands/echo';
import { PraiseMeCommand } from '@/commands/praise-me';
import { BindCommand } from '@/commands/bind';
import { WorkflowCreateCommand } from '@/commands/workflow-create';
import { WorkflowQueryCommand } from '@/commands/workflow-query';
import { VanillaPardonCommand } from '@/commands/vanilla-pardon';
import { VanillaShutUpCommand } from '@/commands/vanilla-shut-up';
import { CaveGetCommand } from '@/commands/cave-get';
import { CavePutCommand } from '@/commands/cave-put';
import { EchoRawCommand } from '@/commands/echo-raw';
import { AliasCommand } from '@/commands/alias';
import { VoteCommand } from '@/commands/vote';
import { GachaCommand } from '@/commands/gacha';
import { Command } from '@/types';
import { InspectCommand } from "@/commands/inspect";

export function resolveCommandUsage(command: Command<any>): string;
export function resolveCommandUsage(command: Command<any>, subCommand: string): string;
export function resolveCommandUsage(command: Command<any>, subCommand?: string): string {
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

export const commands: Command<any>[] = [
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
    new VoteCommand(),
    new GachaCommand(),
    new InspectCommand()
];
