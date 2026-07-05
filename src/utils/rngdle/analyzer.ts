import { formatRollText } from '@/utils/rngdle/daily';
import { RNGDLE_RULES } from '@/utils/rngdle/rules';
import { AnyRngdleRule, RarityTier, RngdleAnalysis, RngdleBadge, RngdleContext, RollStats } from '@/utils/rngdle/types';

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
    if (score >= 100000) return 'mythic';
    if (score >= 10000) return 'anomaly';
    if (score >= 2000) return 'epic';
    if (score >= 500) return 'rare';
    if (score >= 100) return 'uncommon';
    if (score > 0) return 'common';
    return 'trash';
}

export function getRarityTier(totalEp: number): RarityTier {
    if (totalEp >= 100000) return 'mythic';
    if (totalEp >= 30000) return 'anomaly';
    if (totalEp >= 10000) return 'epic';
    if (totalEp >= 3000) return 'rare';
    if (totalEp >= 1000) return 'uncommon';
    if (totalEp > 0) return 'common';
    return 'trash';
}

function createStats(text: string, digits: number[]): RollStats {
    const digitCounts: Record<string, number> = {};
    let maxRunLength = 0;
    let currentRunLength = 0;
    let previousDigit = '';

    for (const digit of text) {
        digitCounts[digit] = (digitCounts[digit] ?? 0) + 1;
        if (digit === previousDigit) {
            currentRunLength += 1;
        } else {
            currentRunLength = 1;
            previousDigit = digit;
        }
        maxRunLength = Math.max(maxRunLength, currentRunLength);
    }

    const counts = Object.values(digitCounts);
    const firstHalf = text.slice(0, 3);
    const secondHalf = text.slice(3);
    const digitSum = digits.reduce((sum, digit) => sum + digit, 0);

    return {
        digitCounts,
        maxDigitCount: Math.max(...counts),
        maxRunLength,
        pairCount: counts.filter(count => count >= 2).length,
        digitSum,
        zeroCount: digitCounts['0'] ?? 0,
        uniqueDigitCount: counts.length,
        firstHalf,
        secondHalf,
        firstHalfSum: firstHalf.split('').reduce((sum, digit) => sum + Number(digit), 0),
        secondHalfSum: secondHalf.split('').reduce((sum, digit) => sum + Number(digit), 0)
    };
}

export function createRngdleContext(roll: number, dayKey?: string): RngdleContext {
    const text = formatRollText(roll);
    const digits = text.split('').map(Number);
    const number = Number(text);
    const stats = createStats(text, digits);
    return { roll, text, number, digits, stats, dayKey };
}

function getRuleInput(rule: AnyRngdleRule, context: RngdleContext) {
    switch (rule.input) {
        case 'text':
            return context.text;
        case 'number':
            return context.number;
        case 'digits':
            return context.digits;
        case 'stats':
            return context.stats;
        case 'context':
            return context;
    }
}

function getScoringRuleIds(matchedRules: AnyRngdleRule[]): Set<string> {
    const scoringIds = new Set<string>();
    const bestByFamily = new Map<string, AnyRngdleRule>();

    for (const rule of matchedRules) {
        if (!rule.family) {
            scoringIds.add(rule.id);
            continue;
        }

        const current = bestByFamily.get(rule.family);
        if (!current || rule.score > current.score) {
            bestByFamily.set(rule.family, rule);
        }
    }

    for (const rule of bestByFamily.values()) {
        scoringIds.add(rule.id);
    }

    return scoringIds;
}

function sortBadges(badges: RngdleBadge[]): RngdleBadge[] {
    return [...badges].sort((a, b) => {
        if (a.isScoring !== b.isScoring) return a.isScoring ? -1 : 1;
        if (a.score !== b.score) return b.score - a.score;
        return a.label.localeCompare(b.label);
    });
}

export function analyzeRoll(roll: number, dayKey?: string): RngdleAnalysis {
    const context = createRngdleContext(roll, dayKey);
    const matchedRules = RNGDLE_RULES.filter(rule => rule.check(getRuleInput(rule, context), context));
    const scoringRuleIds = getScoringRuleIds(matchedRules);

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

    return {
        roll,
        rollText: context.text,
        totalEp,
        rarity,
        bottomBps: 0,
        topBps: 0,
        percentileText: RARITY_DETAILS[rarity].percentileText,
        badges,
        scoringBadges,
        subsidiaryBadges
    };
}
