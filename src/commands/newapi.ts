import { NapLink } from '@naplink/naplink';
import { OneBotV11 } from '@onebots/protocol-onebot-v11/lib';
import { eq } from 'drizzle-orm';
import { AllMessageEvent, Command, CommandScope } from '@/types';
import { reply } from '@/utils/client';
import { db } from '@/db';
import { newApiBindings } from '@/db/schema';
import { formatNewApiUserInfo, getNewApiUserInfo } from '@/utils/newapi';
import { isValidPositiveId } from '@/utils/validator';

export class NewApiCommand implements Command<AllMessageEvent> {
    name = 'newapi';
    aliases = ['额度'];
    description = '绑定 NewAPI 用户 ID 并查询额度。';
    usage = {
        bind: '/newapi bind <NewAPI用户ID>',
        me: '/newapi me'
    };
    scope: CommandScope = 'both';

    validateArgs(args: string[]): boolean {
        if (args.length === 1 && args[0] === 'me') return true;
        if (args.length === 2 && args[0] === 'bind') return isValidPositiveId(args[1]);
        return false;
    }

    async execute(
        args: string[],
        client: NapLink,
        data: OneBotV11.GroupMessageEvent | OneBotV11.PrivateMessageEvent
    ): Promise<void> {
        if (args[0] === 'bind') {
            await this.handleBind(Number(args[1]), client, data);
            return;
        }

        await this.handleMe(client, data);
    }

    private async handleBind(newApiUserId: number, client: NapLink, data: AllMessageEvent): Promise<void> {
        try {
            const info = await getNewApiUserInfo(newApiUserId);
            await db
                .insert(newApiBindings)
                .values({
                    userId: data.user_id,
                    newApiUserId,
                    updatedAt: Date.now()
                })
                .onConflictDoUpdate({
                    target: newApiBindings.userId,
                    set: {
                        newApiUserId,
                        updatedAt: Date.now()
                    }
                });

            await reply(client, data, `已绑定 NewAPI 用户 ID: ${newApiUserId}。\n${formatNewApiUserInfo(info)}`);
        } catch (error) {
            await reply(client, data, `绑定失败：${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    private async handleMe(client: NapLink, data: AllMessageEvent): Promise<void> {
        const binding = await db.query.newApiBindings.findFirst({
            where: eq(newApiBindings.userId, data.user_id)
        });

        if (!binding) {
            await reply(client, data, '你还没有绑定 NewAPI 用户 ID，请先使用 /newapi bind <NewAPI用户ID>。');
            return;
        }

        try {
            const info = await getNewApiUserInfo(binding.newApiUserId);
            await reply(client, data, formatNewApiUserInfo(info));
        } catch (error) {
            await reply(client, data, `查询失败：${error instanceof Error ? error.message : '未知错误'}`);
        }
    }
}
