import { gachaPools, gachaRecords } from '@/db/schema';
import { db } from '@/db';
import { eq } from 'drizzle-orm';
import { NapLink } from '@naplink/naplink';
import { MessageBuilder } from '@/utils/message-builder';

export interface GachaItem {
    item: string;
    quantity: number;
}

export interface GachaResult {
    userId: number;
    userName: string;
    items: GachaItem[];
}

export async function totalizeGachaPool(poolId: number): Promise<GachaResult[]> {
    const [records, poolData] = await Promise.all([
        db.query.gachaRecords.findMany({
            where: eq(gachaRecords.poolId, poolId),
            columns: { userId: true, userName: true }
        }),
        db.query.gachaPools.findFirst({
            where: eq(gachaPools.id, poolId)
        })
    ]);

    if (!poolData || !records.length) {
        return [];
    }

    const poolItems = JSON.parse(poolData.items) as unknown as GachaItem[];
    const users = records.map(r => ({ userId: r.userId, userName: r.userName }));
    const userCount = users.length;

    const resultMap = new Map<number, Map<string, number>>();
    const userNameMap = new Map<number, string>();

    for (const user of users) {
        resultMap.set(user.userId, new Map());
        userNameMap.set(user.userId, user.userName);
    }

    const totalPrizeCount = poolItems.reduce((sum, p) => sum + p.quantity, 0);

    if (totalPrizeCount <= userCount) {
        const flatPrizeList: string[] = [];
        for (const prize of poolItems) {
            for (let i = 0; i < prize.quantity; i++) {
                flatPrizeList.push(prize.item);
            }
        }

        for (let i = flatPrizeList.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [flatPrizeList[i], flatPrizeList[j]] = [flatPrizeList[j], flatPrizeList[i]];
        }

        const shuffledUsers = [...users];
        for (let i = shuffledUsers.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffledUsers[i], shuffledUsers[j]] = [shuffledUsers[j], shuffledUsers[i]];
        }

        for (let i = 0; i < flatPrizeList.length; i++) {
            const winner = shuffledUsers[i];
            const prizeName = flatPrizeList[i];

            const userItems = resultMap.get(winner.userId)!;
            userItems.set(prizeName, 1);
        }

    } else {
        for (const prize of poolItems) {
            const { item, quantity } = prize;
            if (quantity <= 0) continue;

            if (quantity > userCount * 10) {
                let remaining = quantity;

                for (let i = 0; i < userCount - 1; i++) {
                    if (remaining <= 0) break;

                    const avg = remaining / (userCount - i);
                    const count = Math.round(Math.random() * avg * 2);

                    const actualCount = Math.max(0, Math.min(count, remaining));

                    if (actualCount > 0) {
                        const userItems = resultMap.get(users[i].userId)!;
                        userItems.set(item, (userItems.get(item) || 0) + actualCount);
                        remaining -= actualCount;
                    }
                }

                if (remaining > 0) {
                    const lastUserItems = resultMap.get(users[userCount - 1].userId)!;
                    lastUserItems.set(item, (lastUserItems.get(item) || 0) + remaining);
                }
            } else {
                for (let i = 0; i < quantity; i++) {
                    const randomIndex = Math.floor(Math.random() * userCount);
                    const winnerId = users[randomIndex].userId;

                    const userItems = resultMap.get(winnerId)!;
                    userItems.set(item, (userItems.get(item) || 0) + 1);
                }
            }
        }
    }

    const finalResults: GachaResult[] = [];
    for (const [userId, itemsMap] of resultMap) {
        const items: GachaItem[] = [];
        for (const [item, quantity] of itemsMap) {
            if (quantity > 0) {
                items.push({ item, quantity });
            }
        }
        finalResults.push({ userId, userName: userNameMap.get(userId)!, items });
    }

    return finalResults;
}

export async function reportGachaResult(client: NapLink, results: GachaResult[], groupId: number): Promise<void> {
    const messages = results.map(result => {
        const itemList = result.items.map(i => `${i.item} x${i.quantity}`).join(', ');
        if (!itemList) {
            return `用户 ${result.userName}(${result.userId}) 没有获得任何奖品。`;
        }
        return `用户 ${result.userName}(${result.userId}) 获得了: ${itemList}`;
    });
    await client.sendGroupMessage(
        groupId,
        new MessageBuilder()
            .at('all')
            .text('抽奖结果如下：\n' + (messages.length ? messages.join('\n') : '无人中奖。'))
            .build()
    );
}