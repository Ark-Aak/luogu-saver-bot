import { NapLink } from '@naplink/naplink';
import { OneBotV11 } from '@onebots/protocol-onebot-v11/lib';

export type AllMessageEvent = OneBotV11.GroupMessageEvent | OneBotV11.PrivateMessageEvent;

export type CommandScope = 'group' | 'private' | 'both';
export type CommandUsage = string | string[] | Record<string, string>;

export interface Command<T> {
    name: string;
    aliases?: string[];
    description: string;
    usage: CommandUsage;
    scope: CommandScope;
    superUserOnly?: boolean;
    validateArgs?: (args: string[]) => boolean;
    cooldown?: number;
    execute: (args: string[], client: NapLink, data: T) => Promise<void>;
}

export type AliasScope = {
    scopeType: 'group' | 'private';
    scopeId: number;
};
