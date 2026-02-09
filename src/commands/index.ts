import { NapLink } from "@naplink/naplink";

export type CommandScope = 'group' | 'private' | 'both';
export type AllMessageEvent = OneBotV11.GroupMessageEvent | OneBotV11.PrivateMessageEvent;

export interface Command<T> {
  name: string;
  description: string;
  scope: CommandScope;
  validateArgs?: (args: string[]) => boolean;
  cooldown?: number;
  execute: (args: string[], client: NapLink, data: T) => Promise<void>;
}

import { EchoCommand } from "@/commands/echo";
import { PraiseMeCommand } from "@/commands/praise-me";
import { BindCommand } from "@/commands/bind";
import { OneBotV11 } from "@onebots/protocol-onebot-v11/lib";
import { WorkflowCreateCommand } from "@/commands/workflow-create";
import { WorkflowQueryCommand } from "@/commands/workflow-query";
import { VanillaPardonCommand } from "@/commands/vanilla-pardon";
import { VanillaShutUpCommand } from "@/commands/vanilla-shut-up";

export const commands: Command<any>[] = [
    new EchoCommand(),
    new PraiseMeCommand(),
    new BindCommand(),
    new WorkflowCreateCommand(),
    new WorkflowQueryCommand(),
    new VanillaPardonCommand(),
    new VanillaShutUpCommand()
];