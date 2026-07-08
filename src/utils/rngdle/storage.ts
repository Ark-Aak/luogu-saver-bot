import { and, count, eq } from 'drizzle-orm';
import { db } from '@/db';
import { rngdleRerolls, rngdleRolls, rngdleScorePercentiles } from '@/db/schema';
import { analyzeRoll, getRarityTier, RARITY_DETAILS } from '@/utils/rngdle/analyzer';
import { getDeterministicDailyRoll, getLocalDayKey } from '@/utils/rngdle/daily';
import { getRngdlePercentileInfo } from '@/utils/rngdle/percentiles';
import { RarityTier, RngdleAnalysis, RngdleBadge } from '@/utils/rngdle/types';

export interface RngdleRollRecord extends RngdleAnalysis {
    id: number;
    userId: number;
    dayKey: string;
    rerollIndex: number;
    createdAt: number;
}

export interface RngdleUserSummary {
    totalEp: number;
    days: number;
    bestRoll: RngdleRollRecord | null;
    highestRarity: RarityTier;
    uniqueBadgeCount: number;
}

export interface RngdleRerollClearResult {
    previous: RngdleRollRecord | null;
    cleared: boolean;
    rerollIndex: number;
}

export interface RngdleDatabaseClearResult {
    rolls: number;
    rerolls: number;
    scorePercentiles: number;
}

export class RngdlePercentilesNotInitializedError extends Error {
    constructor() {
        super('rngdle percentiles are not initialized');
    }
}

type RngdleRollRow = typeof rngdleRolls.$inferSelect;

function parseBadges(raw: string): RngdleBadge[] {
    try {
        const parsed = JSON.parse(raw) as unknown;
        return Array.isArray(parsed) ? (parsed as RngdleBadge[]) : [];
    } catch {
        return [];
    }
}

export function rowToRngdleRecord(row: RngdleRollRow): RngdleRollRecord {
    const badges = parseBadges(row.badgesJson);
    const rarity = (row.rarity in RARITY_DETAILS ? row.rarity : getRarityTier(row.totalEp)) as RarityTier;
    return {
        id: row.id,
        userId: row.userId,
        dayKey: row.dayKey,
        rerollIndex: row.rerollIndex,
        createdAt: row.createdAt,
        roll: row.roll,
        rollText: row.rollText,
        totalEp: row.totalEp,
        rarity,
        bottomBps: row.bottomBps,
        topBps: row.topBps,
        percentileText: row.percentileText || RARITY_DETAILS[rarity].percentileText,
        badges,
        scoringBadges: badges.filter(badge => badge.isScoring),
        subsidiaryBadges: badges.filter(badge => !badge.isScoring)
    };
}

export async function getRngdleRoll(userId: number, dayKey: string): Promise<RngdleRollRecord | null> {
    const row = await db.query.rngdleRolls.findFirst({
        where: and(eq(rngdleRolls.userId, userId), eq(rngdleRolls.dayKey, dayKey))
    });
    return row ? rowToRngdleRecord(row) : null;
}

async function getRngdleRerollIndex(userId: number, dayKey: string): Promise<number> {
    const row = await db.query.rngdleRerolls.findFirst({
        where: and(eq(rngdleRerolls.userId, userId), eq(rngdleRerolls.dayKey, dayKey))
    });
    return row?.rerollIndex ?? 0;
}

export async function clearRngdleDatabase(): Promise<RngdleDatabaseClearResult> {
    const [rolls] = await db.select({ value: count() }).from(rngdleRolls);
    const [rerolls] = await db.select({ value: count() }).from(rngdleRerolls);
    const [scorePercentiles] = await db.select({ value: count() }).from(rngdleScorePercentiles);

    db.transaction(tx => {
        tx.delete(rngdleRolls).run();
        tx.delete(rngdleRerolls).run();
        tx.delete(rngdleScorePercentiles).run();
    });

    return {
        rolls: rolls?.value ?? 0,
        rerolls: rerolls?.value ?? 0,
        scorePercentiles: scorePercentiles?.value ?? 0
    };
}

async function createRngdleRoll(userId: number, dayKey: string, rerollIndex: number): Promise<RngdleRollRecord> {
    const roll = getDeterministicDailyRoll(userId, dayKey, rerollIndex);
    const analysis = analyzeRoll(roll, dayKey);
    const percentile = await getRngdlePercentileInfo(analysis.totalEp);
    if (!percentile) {
        throw new RngdlePercentilesNotInitializedError();
    }
    const now = Date.now();
    const inserted = await db
        .insert(rngdleRolls)
        .values({
            userId,
            dayKey,
            rerollIndex,
            roll: analysis.roll,
            rollText: analysis.rollText,
            totalEp: analysis.totalEp,
            rarity: percentile.rarity,
            bottomBps: percentile.bottomBps,
            topBps: percentile.topBps,
            percentileText: percentile.percentileText,
            badgesJson: JSON.stringify(analysis.badges),
            createdAt: now
        })
        .onConflictDoNothing()
        .returning();

    if (inserted[0]) {
        return rowToRngdleRecord(inserted[0]);
    }

    const record = await getRngdleRoll(userId, dayKey);
    if (!record) {
        throw new Error('failed to create rngdle roll');
    }
    return record;
}

export async function getOrCreateTodayRngdleRoll(userId: number, date = new Date()): Promise<RngdleRollRecord> {
    const dayKey = getLocalDayKey(date);
    const existing = await getRngdleRoll(userId, dayKey);
    if (existing) return existing;

    const rerollIndex = await getRngdleRerollIndex(userId, dayKey);
    return createRngdleRoll(userId, dayKey, rerollIndex);
}

export async function clearTodayRngdleRollForReroll(
    userId: number,
    updatedBy: number,
    date = new Date()
): Promise<RngdleRerollClearResult> {
    const dayKey = getLocalDayKey(date);
    const previous = await getRngdleRoll(userId, dayKey);
    if (!previous) {
        return { previous: null, cleared: false, rerollIndex: await getRngdleRerollIndex(userId, dayKey) };
    }

    const currentRerollIndex = await getRngdleRerollIndex(userId, dayKey);
    const nextRerollIndex = currentRerollIndex + 1;
    const now = Date.now();

    await db
        .insert(rngdleRerolls)
        .values({
            userId,
            dayKey,
            rerollIndex: nextRerollIndex,
            updatedBy,
            updatedAt: now
        })
        .onConflictDoUpdate({
            target: [rngdleRerolls.userId, rngdleRerolls.dayKey],
            set: {
                rerollIndex: nextRerollIndex,
                updatedBy,
                updatedAt: now
            }
        });

    await db.delete(rngdleRolls).where(and(eq(rngdleRolls.userId, userId), eq(rngdleRolls.dayKey, dayKey)));
    return { previous, cleared: true, rerollIndex: nextRerollIndex };
}

export async function getUserRngdleRolls(userId: number): Promise<RngdleRollRecord[]> {
    const rows = await db.query.rngdleRolls.findMany({
        where: eq(rngdleRolls.userId, userId),
        orderBy: (roll, { desc }) => [desc(roll.createdAt)]
    });
    return rows.map(rowToRngdleRecord);
}

export async function getTodayRngdleRolls(dayKey: string): Promise<RngdleRollRecord[]> {
    const rows = await db.query.rngdleRolls.findMany({
        where: eq(rngdleRolls.dayKey, dayKey),
        orderBy: (roll, { desc }) => [desc(roll.totalEp), desc(roll.createdAt)]
    });
    return rows.map(rowToRngdleRecord);
}

export async function getUserRngdleSummary(userId: number): Promise<RngdleUserSummary> {
    const rolls = await getUserRngdleRolls(userId);
    const totalEp = rolls.reduce((sum, roll) => sum + roll.totalEp, 0);
    const bestRoll = rolls.reduce<RngdleRollRecord | null>((best, roll) => {
        if (!best || roll.totalEp > best.totalEp) return roll;
        return best;
    }, null);
    const uniqueBadgeIds = new Set<string>();
    for (const roll of rolls) {
        for (const badge of roll.badges) {
            uniqueBadgeIds.add(badge.id);
        }
    }

    return {
        totalEp,
        days: rolls.length,
        bestRoll,
        highestRarity: bestRoll?.rarity ?? 'trash',
        uniqueBadgeCount: uniqueBadgeIds.size
    };
}
