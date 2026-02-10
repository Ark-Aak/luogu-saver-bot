import { Command, CommandScope } from '.';
import { NapLink } from "@naplink/naplink";
import { OneBotV11 } from "@onebots/protocol-onebot-v11/lib";
import { MessageBuilder } from "@/utils/message-builder";
import { getTargetId, sendAutoMessage } from '@/utils/client';

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
        await sendAutoMessage(client, false, getTargetId(data),
            new MessageBuilder()
                .reply(data.message_id)
                .atIf(true, data.user_id)
                .text(hasFailed ? '点赞失败。可能已达每日次数上限。' : '指令成功完成。')
                .build()
        );
    }
}
