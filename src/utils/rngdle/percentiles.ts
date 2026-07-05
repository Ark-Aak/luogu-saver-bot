import { db } from '@/db';
import { rngdleScorePercentiles } from '@/db/schema';
import { analyzeRoll } from '@/utils/rngdle/analyzer';
import { RNGDLE_ROLL_RANGE } from '@/utils/rngdle/daily';
import { RarityTier } from '@/utils/rngdle/types';

export interface RngdlePercentileInfo {
    totalEp: number;
    count: number;
    belowCount: number;
    atOrBelowCount: number;
    totalCount: number;
    bottomBps: number;
    topBps: number;
    rarity: RarityTier;
    percentileText: string;
}

export interface RngdlePercentileInitResult {
    totalCount: number;
    distinctScoreCount: number;
    minScore: number;
    maxScore: number;
    rarityCounts: Record<RarityTier, number>;
    updatedAt: number;
}

const INIT_INSERT_CHUNK_SIZE = 400;
const RARITY_ORDER: RarityTier[] = ['trash', 'common', 'uncommon', 'rare', 'epic', 'anomaly', 'mythic'];

function createEmptyRarityCounts(): Record<RarityTier, number> {
    return {
        trash: 0,
        common: 0,
        uncommon: 0,
        rare: 0,
        epic: 0,
        anomaly: 0,
        mythic: 0
    };
}

function formatBpsPercent(bps: number): string {
    if (bps < 100) return '<1';
    if (bps < 1000) return (bps / 100).toFixed(1).replace(/\.0$/, '');
    return String(Math.round(bps / 100));
}

export function getRarityFromPercentiles(bottomBps: number, topBps: number): RarityTier {
    if (bottomBps <= 100) return 'trash';
    if (bottomBps <= 5000) return 'common';
    if (topBps <= 100) return 'mythic';
    if (topBps <= 500) return 'anomaly';
    if (topBps <= 1000) return 'epic';
    if (topBps <= 2500) return 'rare';
    return 'uncommon';
}

export function formatPercentileText(bottomBps: number, topBps: number): string {
    if (bottomBps <= 5000) {
        return `Bottom ${formatBpsPercent(bottomBps)}%`;
    }
    return `Top ${formatBpsPercent(topBps)}%`;
}

export async function isRngdlePercentilesInitialized(): Promise<boolean> {
    const row = await db.query.rngdleScorePercentiles.findFirst();
    return !!row;
}

export async function getRngdlePercentileInfo(totalEp: number): Promise<RngdlePercentileInfo | null> {
    const row = await db.query.rngdleScorePercentiles.findFirst({
        where: (score, { eq }) => eq(score.totalEp, totalEp)
    });
    return row ? { ...row, rarity: row.rarity as RarityTier } : null;
}

export async function initializeRngdlePercentiles(): Promise<RngdlePercentileInitResult> {
    const scoreCounts = new Map<number, number>();

    for (let roll = 0; roll < RNGDLE_ROLL_RANGE; roll += 1) {
        const { totalEp } = analyzeRoll(roll);
        scoreCounts.set(totalEp, (scoreCounts.get(totalEp) ?? 0) + 1);
    }

    const updatedAt = Date.now();
    const sortedScores = [...scoreCounts.entries()].sort((a, b) => a[0] - b[0]);
    const rarityCounts = createEmptyRarityCounts();
    let belowCount = 0;
    const rows = sortedScores.map(([totalEp, count]) => {
        const atOrBelowCount = belowCount + count;
        const bottomBps = Math.ceil((atOrBelowCount * 10000) / RNGDLE_ROLL_RANGE);
        const topBps = Math.ceil(((RNGDLE_ROLL_RANGE - belowCount) * 10000) / RNGDLE_ROLL_RANGE);
        const rarity = getRarityFromPercentiles(bottomBps, topBps);
        const percentileText = formatPercentileText(bottomBps, topBps);
        rarityCounts[rarity] += count;
        const row = {
            totalEp,
            count,
            belowCount,
            atOrBelowCount,
            totalCount: RNGDLE_ROLL_RANGE,
            bottomBps,
            topBps,
            rarity,
            percentileText,
            updatedAt
        };
        belowCount = atOrBelowCount;
        return row;
    });

    db.transaction(tx => {
        tx.delete(rngdleScorePercentiles).run();
        for (let index = 0; index < rows.length; index += INIT_INSERT_CHUNK_SIZE) {
            tx.insert(rngdleScorePercentiles)
                .values(rows.slice(index, index + INIT_INSERT_CHUNK_SIZE))
                .run();
        }
    });

    return {
        totalCount: RNGDLE_ROLL_RANGE,
        distinctScoreCount: sortedScores.length,
        minScore: sortedScores[0]?.[0] ?? 0,
        maxScore: sortedScores[sortedScores.length - 1]?.[0] ?? 0,
        rarityCounts,
        updatedAt
    };
}

export function formatRarityRatios(rarityCounts: Record<RarityTier, number>, totalCount: number): string[] {
    return RARITY_ORDER.map(rarity => {
        const count = rarityCounts[rarity];
        const percent = totalCount === 0 ? '0.00' : ((count / totalCount) * 100).toFixed(2);
        return `${rarity.toUpperCase()}: ${count.toLocaleString()} (${percent}%)`;
    });
}
