import schedule from 'node-schedule';
import { db } from '@/db';
import { gachaPools } from '@/db/schema';
import { eq, and, lt, inArray } from 'drizzle-orm'; // 引入 inArray
import { reportGachaResult, totalizeGachaPool } from '@/helpers/gacha';
import { logger } from '@/utils/logger';
import { NapLink } from '@naplink/naplink';

let isJobRunning = false;

export function scheduleGachaJobs(client: NapLink): void {
    schedule.scheduleJob('*/10 * * * * *', async () => {
        if (isJobRunning) return;
        isJobRunning = true;

        try {
            const now = Date.now();
            const expiredPools = await db.query.gachaPools.findMany({
                where: and(
                    lt(gachaPools.endAt, now),
                    eq(gachaPools.totalized, false)
                ),
                limit: 10
            });

            if (expiredPools.length === 0) {
                return;
            }

            logger.info(`Found ${expiredPools.length} expired gacha pool(s)`);
            for (const pool of expiredPools) {
                try {
                    logger.info(`Settling pool #${pool.id}...`);
                    const results = await totalizeGachaPool(pool.id);
                    await db.update(gachaPools)
                        .set({ totalized: true })
                        .where(eq(gachaPools.id, pool.id));

                    logger.info(`Pool #${pool.id} settled. Winners: ${results.length}`);
                    try {
                        await reportGachaResult(client, results, pool.groupId);
                    } catch (msgError) {
                        logger.error(`Failed to send report for pool #${pool.id}, but pool is settled.`, msgError);
                    }

                } catch (poolError) {
                    logger.error(`Critical error processing pool #${pool.id}:`, poolError);
                }
            }

        } catch (error) {
            logger.error('Error in gacha scheduler:', error);
        } finally {
            isJobRunning = false;
        }
    });

    logger.info('Gacha job scheduler started (interval: 10s)');
}