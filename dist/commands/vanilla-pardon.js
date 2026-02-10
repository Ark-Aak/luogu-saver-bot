import { MessageBuilder } from "@/utils/message-builder";
import { VANILLA_QQ } from "@/constants/bot-qq";
import { getTargetId, sendAutoMessage } from '@/utils/client';
export class VanillaPardonCommand {
    name = '香草说话';
    description = '解禁香草';
    usage = '/香草说话';
    scope = 'group';
    cooldown = 1200000;
    async execute(_args, client, data) {
        if (!(await client.getGroupMemberList(data.group_id))
            .some(member => member.user_id === VANILLA_QQ)) {
            const msgObject = new MessageBuilder()
                .reply(data.message_id)
                .atIf(true, data.user_id)
                .text('香草不在此群，无法解禁。')
                .build();
            await sendAutoMessage(client, false, getTargetId(data), msgObject);
            return;
        }
        let success = false;
        try {
            await client.unsetGroupBan(data.group_id, VANILLA_QQ);
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
