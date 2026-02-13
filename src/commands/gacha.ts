import { NapLink } from '@naplink/naplink';
import { OneBotV11 } from '@onebots/protocol-onebot-v11/lib';
import { Command, CommandScope } from '@/types';
import { isSuperUser } from '@/utils/permission';
import { reply } from '@/utils/client';
import { db } from '@/db';
import { gachaPools, gachaRecords } from '@/db/schema';
import { and, eq, gt } from 'drizzle-orm';

interface GachaItem {
    item: string;
    quantity: number;
}

export class GachaCommand implements Command<OneBotV11.GroupMessageEvent> {
    name = 'gacha';
    aliases = ['抽奖'];
    description = '抽奖指令。';
    usage = {
        create: '/gacha create <标题> <最低等级> <结束时间>',
        push: '/gacha push <奖池ID> <数量> <奖品描述>',
        join: '/gacha join <奖池ID>',
        list: '/gacha list',
        show: '/gacha show <奖池ID>'
    };
    scope: CommandScope = 'group';

    validateArgs(args: string[]): boolean {
        if (args.length === 0) {
            return false;
        }

        const action = args[0];
        if (!['create', 'push', 'join', 'list', 'show'].includes(action)) {
            return false;
        }

        if (action === 'list' && args.length !== 1) {
            return false;
        }

        if (action === 'create' && args.length < 4) {
            return false;
        }

        if (
            action === 'push' &&
            (args.length < 4 || !Number.isInteger(Number(args[1])) || !Number.isInteger(Number(args[2])))
        ) {
            return false;
        }

        if (action === 'join' && (args.length !== 2 || !Number.isInteger(Number(args[1])))) {
            return false;
        }

        if (action === 'show' && (args.length !== 2 || !Number.isInteger(Number(args[1])))) {
            return false;
        }

        return true;
    }

    async execute(args: string[], client: NapLink, data: OneBotV11.GroupMessageEvent): Promise<void> {
        const action = args[0];

        if (action === 'create') {
            if (!isSuperUser(data.user_id)) {
                await reply(client, data, '你没有权限执行此操作。');
                return;
            }
            const title = args[1];
            const minLevel = parseInt(args[2]);
            const endAt = new Date(args.slice(3).join(' ')).getTime();

            const result = await db
                .insert(gachaPools)
                .values({
                    name: title,
                    items: JSON.stringify([]),
                    endAt: endAt,
                    minLevel: minLevel,
                    groupId: data.group_id,
                    totalized: false
                })
                .returning();
            await reply(
                client,
                data,
                `抽奖 "${title}" 已创建，ID：${result[0].id}。\n${minLevel ? `最低要求等级 ${minLevel}。\n` : ''} 结束时间：${new Date(endAt).toLocaleString()}。\n使用 /gacha join ${result[0].id} 参与抽奖。`
            );
        }

        if (action === 'push') {
            if (!isSuperUser(data.user_id)) {
                await reply(client, data, '你没有权限执行此操作。');
                return;
            }
            const poolId = parseInt(args[1]);
            const quantity = parseInt(args[2]);

            if (!quantity) {
                await reply(client, data, '请提供有效的数量。');
                return;
            }

            const item = args.slice(3).join(' ');

            const pool = await db.query.gachaPools.findFirst({
                where: and(eq(gachaPools.id, poolId), eq(gachaPools.groupId, data.group_id))
            });
            if (!pool) {
                await reply(client, data, '奖池不存在。');
                return;
            }

            const items = JSON.parse(pool.items) as GachaItem[];
            if (items.some(i => i.item === item)) {
                items.find(i => i.item === item)!.quantity += quantity;
            } else {
                items.push({ item, quantity });
            }
            db.update(gachaPools)
                .set({ items: JSON.stringify(items) })
                .where(eq(gachaPools.id, poolId))
                .run();
            await reply(client, data, `已将 "${item}" (x${quantity}) 添加到奖池 "${pool.name}" 中。`);
        }

        if (action === 'join') {
            const poolId = parseInt(args[1]);
            const pool = await db.query.gachaPools.findFirst({
                where: and(eq(gachaPools.id, poolId), eq(gachaPools.groupId, data.group_id))
            });
            if (!pool) {
                await reply(client, data, '奖池不存在。');
                return;
            }
            if (Date.now() > new Date(pool.endAt).getTime()) {
                await reply(client, data, `抽奖已结束。`);
                return;
            }
            const userLevelRaw = Number(
                ((await client.getGroupMemberInfo(data.group_id, data.user_id)) as OneBotV11.GroupMemberInfo).level ?? 0
            );
            const userLevel = Number.isFinite(userLevelRaw) ? userLevelRaw : 0;
            if (userLevel < pool.minLevel) {
                await reply(client, data, `你的等级 (${userLevel}) 不满足参与抽奖的最低要求 (${pool.minLevel})。`);
                return;
            }
            const result = db
                .insert(gachaRecords)
                .values({
                    userId: data.user_id,
                    userName: data.sender.nickname,
                    poolId: poolId
                })
                .onConflictDoNothing()
                .run();
            const success = result.changes > 0;
            if (success) {
                await reply(client, data, `成功加入抽奖 "${pool.name}"。`);
            } else {
                await reply(client, data, `你已经加入过抽奖 "${pool.name}" 了。`);
            }
        }

        if (action === 'list') {
            const pools = await db.query.gachaPools.findMany({
                where: and(eq(gachaPools.groupId, data.group_id), gt(gachaPools.endAt, Date.now()))
            });
            if (pools.length === 0) {
                await reply(client, data, '当前没有奖池。');
                return;
            }
            const message = pools
                .map(pool => {
                    return `使用 /gacha show ${pool.id} 查看详细奖品。\n使用 /gacha join ${pool.id} 参与本奖池抽奖。\nID: ${pool.id}\n名称: ${pool.name}\n结束时间: ${new Date(pool.endAt).toLocaleString()}\n最低等级: ${pool.minLevel}`;
                })
                .join('\n\n');
            await reply(client, data, message);
        }

        if (action === 'show') {
            const poolId = parseInt(args[1]);
            const pool = await db.query.gachaPools.findFirst({
                where: and(eq(gachaPools.id, poolId), eq(gachaPools.groupId, data.group_id))
            });
            if (!pool) {
                await reply(client, data, '奖池不存在。');
                return;
            }
            const items = JSON.parse(pool.items) as GachaItem[];
            const itemList = items.map(i => `${i.item} (x${i.quantity})`).join('\n');
            await reply(
                client,
                data,
                `奖池 "${pool.name}"：${pool.minLevel ? `\n最低要求等级：${pool.minLevel}` : ''}\n结束时间：${new Date(pool.endAt).toLocaleString()}\n奖品列表：\n${itemList}`
            );
        }
    }
}
