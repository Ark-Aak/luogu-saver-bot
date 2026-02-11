import { NapLink } from '@naplink/naplink';
import { OneBotV11 } from '@onebots/protocol-onebot-v11/lib';
import { reply } from '@/utils/client';
import { Command, CommandScope } from '@/types';

export class PraiseMeCommand implements Command<OneBotV11.GroupMessageEvent> {
    name = '赞我';
    description = 'QQ 刷赞';
    usage = '/赞我';
    scope: CommandScope = 'group';

    async execute(_args: string[], client: NapLink, data: OneBotV11.GroupMessageEvent): Promise<void> {
        let hasFailed = false;
        try {
            await client.sendLike(data.user_id, 10);
        } catch (_error) {
            hasFailed = true;
        }
        await reply(client, data, hasFailed ? '点赞失败。可能已达每日次数上限。' : '指令成功完成。');
    }
}
