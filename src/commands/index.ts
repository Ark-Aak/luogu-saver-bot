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
import { InspectCommand } from '@/commands/inspect';
import { ShutUpCommand } from '@/commands/shut-up';
import { BanCommandCommand } from '@/commands/ban-command';
import { RechargeCommand } from '@/commands/recharge';
import { ToggleCommand } from '@/commands/toggle';
import { NewApiCommand } from '@/commands/newapi';
import { QaCommand } from '@/commands/qa';
import { RecallCommand } from '@/commands/recall';
import { ManageCommand } from '@/commands/manage';
import { EchoParseCommand } from '@/commands/echo-parse';
import { DonateCommand } from '@/commands/donate';
import { BlacklistCommand } from '@/commands/blacklist';
import { RngdleCommand } from '@/commands/rngdle';

export function resolveCommandUsage(command: Command<any>): string;
export function resolveCommandUsage(command: Command<any>, ...subCommands: string[]): string;
export function resolveCommandUsage(command: Command<any>, ...subCommands: string[]): string {
    if (typeof command.usage === 'string') {
        return command.usage;
    }
    if (Array.isArray(command.usage)) {
        return command.usage.join('\n');
    }

    let current: string | Record<string, string | Record<string, string>> = command.usage;
    for (const subCommand of subCommands) {
        if (!subCommand || typeof current === 'string') break;
        const next: string | Record<string, string | Record<string, string>> | undefined = current[subCommand];
        if (!next) break;
        current = next;
    }

    if (typeof current === 'string') {
        return current;
    }

    return Object.values(current)
        .map(usage => (typeof usage === 'string' ? usage : Object.values(usage).join('\n')))
        .join('\n');
}

export const commands: Command<any>[] = [
    new EchoCommand(),
    new EchoRawCommand(),
    new EchoParseCommand(),
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
    new InspectCommand(),
    new ShutUpCommand(),
    new BanCommandCommand(),
    new RechargeCommand(),
    new NewApiCommand(),
    new QaCommand(),
    new RecallCommand(),
    new ManageCommand(),
    new ToggleCommand(),
    new BlacklistCommand(),
    new RngdleCommand(),
    new DonateCommand()
];
