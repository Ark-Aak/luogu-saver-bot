import { NapLink } from '@naplink/naplink';
import { OneBotV11 } from '@onebots/protocol-onebot-v11/lib';
import { Command, CommandScope } from '@/types';
import { reply } from '@/utils/client';
import { isAdminByData, isSuperUser } from '@/utils/permission';
import { getErrorMessage } from '@/utils/error';

export class RecallCommand implements Command<OneBotV11.GroupMessageEvent> {
    name = 'recall';
    aliases = ['撤回'];
    description = '撤回回复引用的消息。';
    usage = '/recall（回复要撤回的消息）';
    scope: CommandScope = 'group';

    validateArgs(args: string[]): boolean {
        return args.length === 0;
    }

    async execute(
        args: string[],
        client: NapLink,
        data: OneBotV11.GroupMessageEvent,
        replyMessageId?: number
    ): Promise<void> {
        if (!isSuperUser(data.user_id) && !(await isAdminByData(client, data))) {
            await reply(client, data, '权限不足。');
            return;
        }

        if (!replyMessageId) {
            await reply(client, data, '请回复需要撤回的消息后使用 /recall。');
            return;
        }

        try {
            await client.deleteMessage(replyMessageId);
        } catch (error) {
            await reply(client, data, `撤回失败：${getErrorMessage(error)}`);
        }
    }
}
