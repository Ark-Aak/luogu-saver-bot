import { Command, CommandScope } from '.';
import { NapLink } from "@naplink/naplink";
import { OneBotV11 } from "@onebots/protocol-onebot-v11/lib";
import { MessageBuilder } from "@/utils/message-builder";
import { db } from "@/db";
import { caves } from "@/db/schema";

export class CavePutCommand implements Command<OneBotV11.GroupMessageEvent> {
    name = 'cave.put';
    description = '向回声洞中发送一条消息';
    scope: CommandScope = 'group';
    cooldown = 120000;

    validateArgs(args: string[]): boolean {
        return args.length > 0;
    }

    async execute(args: string[], client: NapLink, data: OneBotV11.GroupMessageEvent): Promise<void> {
        const msg = args.join(' ');
        let success = false;
        try {
            await db.insert(caves).values({
                senderName: data.sender.nickname,
                senderId: data.user_id,
                groupId: data.group_id,
                rawText: msg,
            });
            success = true;
        } catch {}
        await client.sendGroupMessage(
            data.group_id,
            new MessageBuilder()
                .reply(data.message_id)
                .at(data.user_id)
                .text(success ? '投稿成功。' : '投稿失败。')
                .build()
        );
    }
}