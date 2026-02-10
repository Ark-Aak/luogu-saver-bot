import { NapLink } from "@naplink/naplink";

export type CommandScope = 'group' | 'private' | 'both';
export type AllMessageEvent = OneBotV11.GroupMessageEvent | OneBotV11.PrivateMessageEvent;
export type CommandUsage = string | string[] | Record<string, string>;
export type ValidateResult = boolean | 'replied';

export interface Command<T> {
  name: string;
  aliases?: string[];
  description: string;
  usage: CommandUsage;
  scope: CommandScope;
  validateArgs?: (args: string[], client: NapLink, data: T) => ValidateResult | Promise<ValidateResult>;
  cooldown?: number;
  execute: (args: string[], client: NapLink, data: T) => Promise<void>;
}

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

import { EchoCommand } from "@/commands/echo";
import { PraiseMeCommand } from "@/commands/praise-me";
import { BindCommand } from "@/commands/bind";
import { OneBotV11 } from "@onebots/protocol-onebot-v11/lib";
import { WorkflowCreateCommand } from "@/commands/workflow-create";
import { WorkflowQueryCommand } from "@/commands/workflow-query";
import { VanillaPardonCommand } from "@/commands/vanilla-pardon";
import { VanillaShutUpCommand } from "@/commands/vanilla-shut-up";
import { CaveGetCommand } from "@/commands/cave-get";
import { CavePutCommand } from "@/commands/cave-put";
import { EchoRawCommand } from "@/commands/echo-raw";
import { AliasCommand } from "@/commands/alias";
import { VoteCommand } from "@/commands/vote";

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
    new VoteCommand()
];
