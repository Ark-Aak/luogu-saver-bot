import { Command, CommandScope } from '.';
import { NapLink } from "@naplink/naplink";
import { OneBotV11 } from "@onebots/protocol-onebot-v11/lib";
import { MessageBuilder } from "@/utils/message-builder";

export class PraiseMeCommand implements Command<OneBotV11.GroupMessageEvent> {
    name = '赞我';
    description = 'QQ 刷赞';
    scope: CommandScope = 'group';

    async execute(args: string[], client: NapLink, data: OneBotV11.GroupMessageEvent): Promise<void> {
        let hasFailed = false;
        try {
            await client.sendLike(data.user_id, 10);
        } catch (_error) {
            hasFailed = true;
        }
        await client.sendGroupMessage(
            data.group_id,
            new MessageBuilder()
                .reply(data.message_id)
                .at(data.user_id)
                .text(hasFailed ? '点赞失败。可能已达每日次数上限。' : '指令成功完成。')
                .build()
        );
    }
}
