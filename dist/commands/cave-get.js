import { MessageBuilder } from "@/utils/message-builder";
import { db } from "@/db";
import { getRandomElement } from "@/utils/random";
import { getTargetId, sendAutoMessage } from '@/utils/client';
export class CaveGetCommand {
    name = 'cave';
    description = '从回声洞中获取一条消息';
    usage = '/cave';
    scope = 'group';
    cooldown = 120000;
    async execute(args, client, data) {
        let success = false;
        let result = null;
        try {
            const caves = await db.query.caves.findMany({
                where: (cave, { eq }) => eq(cave.groupId, data.group_id)
            });
            const cave = getRandomElement(caves);
            if (cave) {
                result = `${cave.rawText}\n——${cave.senderName}(${cave.senderId})`;
            }
            else {
                result = '回声洞中没有消息。';
            }
            success = true;
        }
        catch { }
        await sendAutoMessage(client, false, getTargetId(data), new MessageBuilder()
            .reply(data.message_id)
            .cqCode(success ? result : '获取失败。')
            .build());
    }
}
