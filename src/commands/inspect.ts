import { NapLink } from '@naplink/naplink';
import { OneBotV11 } from '@onebots/protocol-onebot-v11/lib';
import { reply } from '@/utils/client';
import { Command, CommandScope } from '@/types';
import { isValidPositiveInteger } from '@/utils/validator';
import { normalizeUserTargets } from '@/utils/command-args';

export class InspectCommand implements Command<OneBotV11.GroupMessageEvent> {
    name = 'inspect';
    description = '查看群员信息。';
    usage = '/inspect <QQ号/@用户>';
    scope: CommandScope = 'group';
    superUserOnly = true;
    normalizeArgs = normalizeUserTargets(0);

    validateArgs(args: string[]): boolean {
        return args.length === 1 && isValidPositiveInteger(args[0]);
    }

    async execute(args: string[], client: NapLink, data: OneBotV11.GroupMessageEvent): Promise<void> {
        const userId = Number(args[0]);

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
