import { NapLink } from '@naplink/naplink';
import { OneBotV11 } from '@onebots/protocol-onebot-v11/lib';
import { db } from '@/db';
import { getRandomElement } from '@/utils/random';
import { reply } from '@/utils/client';
import { Command, CommandScope } from '@/types';

export class CaveGetCommand implements Command<OneBotV11.GroupMessageEvent> {
    name = 'cave';
    description = '从回声洞中获取一条消息';
    usage = '/cave';
    scope: CommandScope = 'group';
    cooldown = 60000;

    async execute(_args: string[], client: NapLink, data: OneBotV11.GroupMessageEvent): Promise<void> {
        let success = false;
        let result: string | null = null;
        try {
            const caves = await db.query.caves.findMany({
                where: (cave, { eq }) => eq(cave.groupId, data.group_id)
            });
            const cave = getRandomElement(caves);
            if (cave) {
                result = `${cave.rawText}\n——${cave.senderName}(${cave.senderId})`;
            } else {
                result = '回声洞中没有消息。';
            }
            success = true;
        } catch {}
        await reply(client, data, success ? result! : '获取回声洞消息失败。');
    }
}
