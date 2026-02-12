import { NapLink } from '@naplink/naplink';
import { OneBotV11 } from '@onebots/protocol-onebot-v11/lib';
import { db } from '@/db';
import { caves } from '@/db/schema';
import { Moderation } from '@/utils/moderation';
import { logger } from '@/utils/logger';
import { reply } from '@/utils/client';
import { Command, CommandScope } from '@/types';

export class CavePutCommand implements Command<OneBotV11.GroupMessageEvent> {
    name = 'cave.put';
    description = '向回声洞中发送一条消息';
    usage = '/cave.put <内容(100字内)>';
    scope: CommandScope = 'group';
    cooldown = 60000;

    validateArgs(args: string[]): boolean {
        return args.length > 0 && args.join(' ').length <= 100;
    }

    async execute(args: string[], client: NapLink, data: OneBotV11.GroupMessageEvent): Promise<void> {
        const msg = args.join(' ');
        let success = false;
        try {
            const moderation = await Moderation.moderateText(msg);
            if (!moderation) {
                await reply(client, data, '消息内容未通过审查，请修改后重试。');
                return;
            }
            await db.insert(caves).values({
                senderName: data.sender.nickname,
                senderId: data.user_id,
                groupId: data.group_id,
                rawText: msg
            });
            success = true;
        } catch (error) {
            logger.error('Failed to put message into cave:', error);
        }
        await reply(client, data, success ? '投稿成功。' : '投稿失败。');
    }
}
