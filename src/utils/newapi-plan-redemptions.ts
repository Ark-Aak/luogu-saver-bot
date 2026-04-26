import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { newApiPlanRedemptions } from '@/db/schema';

export type NewApiPlanRedemptionBalance = {
    planId: number;
    count: number;
};

export function getNewApiPlanRedemptions(userId: number): Promise<NewApiPlanRedemptionBalance[]> {
    return db.query.newApiPlanRedemptions.findMany({
        where: eq(newApiPlanRedemptions.userId, userId),
        columns: {
            planId: true,
            count: true
        }
    });
}

export async function getNewApiPlanRedemptionCount(userId: number, planId: number): Promise<number> {
    const record = await db.query.newApiPlanRedemptions.findFirst({
        where: and(eq(newApiPlanRedemptions.userId, userId), eq(newApiPlanRedemptions.planId, planId)),
        columns: { count: true }
    });

    return record?.count ?? 0;
}

export async function grantNewApiPlanRedemptions(userId: number, planId: number, count: number): Promise<number> {
    if (count <= 0) {
        throw new Error('发放次数必须大于 0。');
    }

    const currentCount = await getNewApiPlanRedemptionCount(userId, planId);
    const nextCount = currentCount + count;

    await db
        .insert(newApiPlanRedemptions)
        .values({
            userId,
            planId,
            count: nextCount,
            updatedAt: Date.now()
        })
        .onConflictDoUpdate({
            target: [newApiPlanRedemptions.userId, newApiPlanRedemptions.planId],
            set: {
                count: nextCount,
                updatedAt: Date.now()
            }
        });

    return nextCount;
}

export async function consumeNewApiPlanRedemption(userId: number, planId: number): Promise<number> {
    const currentCount = await getNewApiPlanRedemptionCount(userId, planId);
    if (currentCount <= 0) {
        throw new Error('没有可用的套餐兑换次数。');
    }

    const nextCount = currentCount - 1;
    await db
        .update(newApiPlanRedemptions)
        .set({
            count: nextCount,
            updatedAt: Date.now()
        })
        .where(and(eq(newApiPlanRedemptions.userId, userId), eq(newApiPlanRedemptions.planId, planId)));

    return nextCount;
}
