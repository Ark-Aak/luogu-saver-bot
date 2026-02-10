import { MessageBuilder } from "@/utils/message-builder";
import { VANILLA_QQ } from "@/constants/bot-qq";
import { getTargetId, sendAutoMessage } from '@/utils/client';
export class VanillaShutUpCommand {
    name = '香草闭嘴';
    description = '禁言香草';
    usage = '/香草闭嘴';
    scope = 'group';
    cooldown = 1200000;
    async execute(_args, client, data) {
        if (!(await client.getGroupMemberList(data.group_id))
            .some(member => member.user_id === VANILLA_QQ)) {
            const msgObject = new MessageBuilder()
                .reply(data.message_id)
                .atIf(true, data.user_id)
                .text('香草不在此群，无法禁言。')
                .build();
            await sendAutoMessage(client, false, getTargetId(data), msgObject);
            return;
        }
        let success = false;
        try {
            await client.setGroupBan(data.group_id, VANILLA_QQ, 60 * 60 * 24);
            success = true;
        }
        catch { }
        const msgObject = new MessageBuilder()
            .reply(data.message_id)
            .atIf(true, data.user_id)
            .text(success ? '指令成功完成。' : '指令执行失败。')
            .build();
        await sendAutoMessage(client, false, getTargetId(data), msgObject);
    }
}
