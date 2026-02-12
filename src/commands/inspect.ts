import { NapLink } from '@naplink/naplink';
import { OneBotV11 } from '@onebots/protocol-onebot-v11/lib';
import { reply } from '@/utils/client';
import { Command, CommandScope } from '@/types';

export class InspectCommand implements Command<OneBotV11.GroupMessageEvent> {
    name = 'inspect';
    description = '查看群员信息。';
    usage = '/inspect <userId>';
    scope: CommandScope = 'group';
    superUserOnly = true;

    validateArgs(args: string[]): boolean {
        return args.length === 1 && /^\d+$/.test(args[0]);
    }

    async execute(args: string[], client: NapLink, data: OneBotV11.GroupMessageEvent): Promise<void> {
        const userId = args[0];
        try {
            const memberInfo = await client.getGroupMemberInfo(data.group_id, userId);
            const message = Object.entries(memberInfo)
                .map(([key, value]) => `${key}: ${value}`)
                .join('\n');
            await reply(client, data, message);
        } catch (error: unknown) {
            await reply(client, data, `无法获取用户信息: ${(error as Error).message}`);
        }
    }
}
