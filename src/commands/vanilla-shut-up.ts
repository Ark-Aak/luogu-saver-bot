import { Command, CommandScope } from '.';
import { NapLink } from "@naplink/naplink";
import { OneBotV11 } from "@onebots/protocol-onebot-v11/lib";
import { MessageBuilder } from "@/utils/message-builder";
import { VANILLA_QQ } from "@/constants/bot-qq";

export class VanillaShutUpCommand implements Command<OneBotV11.GroupMessageEvent> {
    name = '香草闭嘴';
    description = '禁言香草';
    scope: CommandScope = 'group';

    async execute(_args: string[], client: NapLink, data: OneBotV11.GroupMessageEvent): Promise<void> {
        if (
            !(await client.getGroupMemberList(data.group_id) as OneBotV11.GroupMemberInfo[])
            .some(member => member.user_id === VANILLA_QQ)
        ) {
            const msgObject = new MessageBuilder()
                .reply(data.message_id)
                .at(data.user_id)
                .text('香草不在此群，无法禁言。')
                .build();
            await client.sendGroupMessage(data.group_id, msgObject);
            return;
        }
        let success = false;
        try {
            await client.setGroupBan(data.group_id, VANILLA_QQ, 60 * 60 * 24);
            success = true;
        } catch {}
        const msgObject = new MessageBuilder()
            .reply(data.message_id)
            .at(data.user_id)
            .text(success ? '指令成功完成' : '指令执行失败。')
            .build();
        await client.sendGroupMessage(data.group_id, msgObject);
    }
}
