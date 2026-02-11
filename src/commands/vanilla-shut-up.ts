import { NapLink } from '@naplink/naplink';
import { OneBotV11 } from '@onebots/protocol-onebot-v11/lib';
import { VANILLA_QQ } from '@/constants/bot-qq';
import { reply } from '@/utils/client';
import { Command, CommandScope } from '@/types';

export class VanillaShutUpCommand implements Command<OneBotV11.GroupMessageEvent> {
    name = '香草闭嘴';
    description = '禁言香草';
    usage = '/香草闭嘴';
    scope: CommandScope = 'group';
    cooldown = 1200000;

    async execute(_args: string[], client: NapLink, data: OneBotV11.GroupMessageEvent): Promise<void> {
        if (
            !((await client.getGroupMemberList(data.group_id)) as OneBotV11.GroupMemberInfo[]).some(
                member => member.user_id === VANILLA_QQ
            )
        ) {
            await reply(client, data, '香草不在此群，无法禁言。');
            return;
        }
        let success = false;
        try {
            await client.setGroupBan(data.group_id, VANILLA_QQ, 60 * 60 * 24);
            success = true;
        } catch {}
        await reply(client, data, success ? '指令成功完成。' : '指令执行失败。');
    }
}
