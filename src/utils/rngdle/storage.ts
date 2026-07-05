import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { rngdleRolls } from '@/db/schema';
import { analyzeRoll, getRarityTier, RARITY_DETAILS } from '@/utils/rngdle/analyzer';
import { getDeterministicDailyRoll, getLocalDayKey } from '@/utils/rngdle/daily';
import { RarityTier, RngdleAnalysis, RngdleBadge } from '@/utils/rngdle/types';

export interface RngdleRollRecord extends RngdleAnalysis {
    id: number;
    userId: number;
    dayKey: string;
    createdAt: number;
}

export interface RngdleUserSummary {
    totalEp: number;
    days: number;
    bestRoll: RngdleRollRecord | null;
    highestRarity: RarityTier;
    uniqueBadgeCount: number;
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
        createdAt: row.createdAt,
        roll: row.roll,
        rollText: row.rollText,
        totalEp: row.totalEp,
        rarity,
        percentileText: RARITY_DETAILS[rarity].percentileText,
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

export async function getOrCreateTodayRngdleRoll(userId: number, date = new Date()): Promise<RngdleRollRecord> {
    const dayKey = getLocalDayKey(date);
    const existing = await getRngdleRoll(userId, dayKey);
    if (existing) return existing;

    const roll = getDeterministicDailyRoll(userId, dayKey);
    const analysis = analyzeRoll(roll, dayKey);
    const now = Date.now();
    const inserted = await db
        .insert(rngdleRolls)
        .values({
            userId,
            dayKey,
            roll: analysis.roll,
            rollText: analysis.rollText,
            totalEp: analysis.totalEp,
            rarity: analysis.rarity,
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
