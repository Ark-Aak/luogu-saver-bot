import schedule from 'node-schedule';
import { db } from '@/db';
import { gachaPools } from '@/db/schema';
import { and, eq, gt } from 'drizzle-orm';
import { logger } from '@/utils/logger';
import { NapLink } from '@naplink/naplink';
import { sendGroupMessage } from '@/utils/client';

let isJobRunning = false;

export function scheduleGachaHintJobs(client: NapLink): void {
    schedule.scheduleJob('0 0 * * * *', async () => {
        if (isJobRunning) return;
        isJobRunning = true;
        try {
            const now = Date.now();
            const runningPools = await db.query.gachaPools.findMany({
                where: and(gt(gachaPools.endAt, now), eq(gachaPools.totalized, false))
            });
            if (!runningPools || runningPools.length === 0) {
                logger.info('No active gacha pools found for hint job.');
                return;
            }
            const groupMap = new Map<number, (typeof runningPools)[0][]>();

            for (const pool of runningPools) {
                if (!groupMap.has(pool.groupId)) {
                    groupMap.set(pool.groupId, []);
                }
                groupMap.get(pool.groupId)!.push(pool);
            }

            for (const [groupId, pools] of groupMap.entries()) {
                const hintMessage =
                    '本群正在进行的抽奖：\n' +
                    pools
                        .map(pool => {
                            const timeLeft = pool.endAt - now;
                            const minutesLeft = Math.ceil(timeLeft / 60000);
                            const items = JSON.parse(pool.items) as { name: string; quantity: number }[];
                            const itemSum = items.reduce((sum, item) => sum + item.quantity, 0);
                            const itemCount = items.length;
                            const messageLines = [
                                `奖池 #${pool.id} - ${pool.name}：`,
                                `剩余时间：${minutesLeft} 分钟。`,
                                `奖品数量：${itemSum} (${itemCount} 种)。`,
                                `输入 /gacha show ${pool.id} 查看详情。`,
                                `输入 /gacha join ${pool.id} 参与抽奖。`
                            ];
                            if (pool.minLevel) {
                                messageLines.push(`最低等级要求：${pool.minLevel}`);
                            }
                            return messageLines.join('\n');
                        })
                        .join('\n\n');
                try {
                    await sendGroupMessage(client, groupId, hintMessage);
                } catch (msgError) {
                    logger.error(`Failed to send hint message to group ${groupId}.`, msgError);
                }
            }
        } catch (error) {
            logger.error('Error in gacha scheduler:', error);
        } finally {
            isJobRunning = false;
        }
    });

    logger.info('Gacha hint job scheduler started (interval: 3600s)');
}
