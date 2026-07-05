export type RarityTier = 'trash' | 'common' | 'uncommon' | 'rare' | 'epic' | 'anomaly' | 'mythic';

export type RuleInputKind = 'text' | 'number' | 'digits' | 'stats' | 'context';

export type DigitCounts = Record<string, number>;

export interface RollStats {
    digitCounts: DigitCounts;
    maxDigitCount: number;
    maxRunLength: number;
    pairCount: number;
    digitSum: number;
    zeroCount: number;
    uniqueDigitCount: number;
    firstHalf: string;
    secondHalf: string;
    firstHalfSum: number;
    secondHalfSum: number;
}

export interface RngdleContext {
    roll: number;
    text: string;
    number: number;
    digits: number[];
    stats: RollStats;
    dayKey?: string;
}

export type RuleInputMap = {
    text: string;
    number: number;
    digits: number[];
    stats: RollStats;
    context: RngdleContext;
};

export interface RngdleRule<K extends RuleInputKind = RuleInputKind> {
    id: string;
    label: string;
    description: string;
    emoji: string;
    score: number;
    family?: string;
    input: K;
    check: (value: RuleInputMap[K], context: RngdleContext) => boolean;
}

export interface AnyRngdleRule {
    id: string;
    label: string;
    description: string;
    emoji: string;
    score: number;
    family?: string;
    input: RuleInputKind;
    check: (value: any, context: RngdleContext) => boolean;
}

export function defineRule<K extends RuleInputKind>(rule: RngdleRule<K>): AnyRngdleRule {
    return rule;
}

export interface RngdleBadge {
    id: string;
    label: string;
    description: string;
    emoji: string;
    score: number;
    rarity: RarityTier;
    family?: string;
    isScoring: boolean;
}

export interface RngdleAnalysis {
    roll: number;
    rollText: string;
    totalEp: number;
    rarity: RarityTier;
    bottomBps: number;
    topBps: number;
    percentileText: string;
    badges: RngdleBadge[];
    scoringBadges: RngdleBadge[];
    subsidiaryBadges: RngdleBadge[];
}
