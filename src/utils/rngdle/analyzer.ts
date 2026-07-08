import { formatRollText } from '@/utils/rngdle/daily';
import {
    formatOfficialPercentileText,
    getOfficialBadgeRarityTier,
    getOfficialCardRarityTier,
    getOfficialScoringRuleIds,
    officialPercentileToBps
} from '@/utils/rngdle/official';
import { RNGDLE_RULES } from '@/utils/rngdle/rules';
import { RarityTier, RngdleAnalysis, RngdleBadge, RngdleContext, RollStats } from '@/utils/rngdle/types';

export const RARITY_DETAILS: Record<RarityTier, { emoji: string; label: string; percentileText: string }> = {
    trash: { emoji: '🟫', label: 'TRASH', percentileText: 'Uninitialized' },
    common: { emoji: '⬜', label: 'COMMON', percentileText: 'Uninitialized' },
    uncommon: { emoji: '🟩', label: 'UNCOMMON', percentileText: 'Uninitialized' },
    rare: { emoji: '🟦', label: 'RARE', percentileText: 'Uninitialized' },
    epic: { emoji: '🟪', label: 'EPIC', percentileText: 'Uninitialized' },
    anomaly: { emoji: '🟧', label: 'ANOMALY', percentileText: 'Uninitialized' },
    mythic: { emoji: '🟥', label: 'MYTHIC', percentileText: 'Uninitialized' }
};

const RARITY_ORDER: RarityTier[] = ['trash', 'common', 'uncommon', 'rare', 'epic', 'anomaly', 'mythic'];

export function compareRarity(a: RarityTier, b: RarityTier): number {
    return RARITY_ORDER.indexOf(a) - RARITY_ORDER.indexOf(b);
}

export function getBadgeRarityTier(score: number): RarityTier {
    return getOfficialBadgeRarityTier(score);
}

export function getRarityTier(totalEp: number): RarityTier {
    return getOfficialCardRarityTier(totalEp);
}

function createStats(text: string, digits: number[]): RollStats {
    const digitCounts: Record<string, number> = {};
    let maxRunLength = 0;
    let currentRunLength = 0;
    let previousDigit = '';

    for (const digit of text) {
        digitCounts[digit] = (digitCounts[digit] ?? 0) + 1;
        currentRunLength = digit === previousDigit ? currentRunLength + 1 : 1;
        previousDigit = digit;
        maxRunLength = Math.max(maxRunLength, currentRunLength);
    }

    const counts = Object.values(digitCounts);
    const firstHalf = text.slice(0, Math.floor(text.length / 2));
    const secondHalf = text.slice(firstHalf.length);
    const sumText = (value: string) => value.split('').reduce((sum, digit) => sum + Number(digit), 0);

    return {
        digitCounts,
        maxDigitCount: Math.max(...counts),
        maxRunLength,
        pairCount: counts.filter(count => count >= 2).length,
        digitSum: digits.reduce((sum, digit) => sum + digit, 0),
        zeroCount: digitCounts['0'] ?? 0,
        uniqueDigitCount: counts.length,
        firstHalf,
        secondHalf,
        firstHalfSum: sumText(firstHalf),
        secondHalfSum: sumText(secondHalf)
    };
}

export function createRngdleContext(roll: number, dayKey?: string): RngdleContext {
    const text = formatRollText(roll);
    const digits = text.split('').map(Number);
    const number = Number(text);
    const stats = createStats(text, digits);
    return { roll, text, number, digits, stats, dayKey };
}

function sortBadges(badges: RngdleBadge[]): RngdleBadge[] {
    return [...badges].sort((a, b) => b.score - a.score);
}

export function analyzeRoll(roll: number, dayKey?: string): RngdleAnalysis {
    const context = createRngdleContext(roll, dayKey);
    const matchedRules = RNGDLE_RULES.filter(rule => rule.check(context, context));
    const scoringRuleIds = getOfficialScoringRuleIds(matchedRules);

    const badges = sortBadges(
        matchedRules.map(rule => ({
            id: rule.id,
            label: rule.label,
            description: rule.description,
            emoji: rule.emoji,
            score: rule.score,
            rarity: getBadgeRarityTier(rule.score),
            family: rule.family,
            isScoring: scoringRuleIds.has(rule.id)
        }))
    );

    const scoringBadges = badges.filter(badge => badge.isScoring);
    const subsidiaryBadges = badges.filter(badge => !badge.isScoring);
    const totalEp = scoringBadges.reduce((sum, badge) => sum + badge.score, 0);
    const rarity = getRarityTier(totalEp);
    const { bottomBps, topBps } = officialPercentileToBps(totalEp);

    return {
        roll,
        rollText: context.text,
        totalEp,
        rarity,
        bottomBps,
        topBps,
        percentileText: formatOfficialPercentileText(totalEp),
        badges,
        scoringBadges,
        subsidiaryBadges
    };
}
