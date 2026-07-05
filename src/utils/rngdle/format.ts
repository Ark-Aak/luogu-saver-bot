import { RARITY_DETAILS } from '@/utils/rngdle/analyzer';
import { formatCountdown, getMillisUntilNextLocalMidnight } from '@/utils/rngdle/daily';
import { RngdleRollRecord } from '@/utils/rngdle/storage';
import { RarityTier, RngdleBadge } from '@/utils/rngdle/types';

export function formatEp(value: number): string {
    return value.toLocaleString();
}

export function formatRarity(rarity: RarityTier): string {
    const detail = RARITY_DETAILS[rarity];
    return `${detail.emoji} ${detail.label}`;
}

export function formatRollRarity(rarity: RarityTier, percentileText: string): string {
    return `${formatRarity(rarity)} • ${percentileText}`;
}

export function formatBadge(badge: RngdleBadge, includeScore = false): string {
    const rarityEmoji = RARITY_DETAILS[badge.rarity].emoji;
    const scoreText = includeScore ? ` +${formatEp(badge.score)} EP` : '';
    return `${rarityEmoji} ${badge.emoji} ${badge.label}${scoreText}`;
}

export function formatNextRollLine(date = new Date()): string {
    return `Next roll in ${formatCountdown(getMillisUntilNextLocalMidnight(date))}`;
}

export function formatRngdleShare(record: RngdleRollRecord, lifetimeEp: number): string {
    const badgeLines = record.badges.slice(0, 3).map(badge => formatBadge(badge));
    const remaining = record.badges.length - badgeLines.length;
    const moreLine = remaining > 0 ? [`+${remaining} more`] : [];

    return [
        `RNGdle 🎲 ${record.rollText}`,
        '',
        formatRollRarity(record.rarity, record.percentileText),
        '',
        ...badgeLines,
        ...moreLine,
        '',
        `${formatEp(record.totalEp)} EP`,
        `Lifetime EP: ${formatEp(lifetimeEp)}`,
        '使用 /rngdle detail 查看完整结果。',
        formatNextRollLine()
    ].join('\n');
}

export function formatRngdleDetail(record: RngdleRollRecord, lifetimeEp: number): string {
    const scoringLines = record.scoringBadges.map((badge, index) => `${index + 1}. ${formatBadge(badge, true)}`);
    const subsidiaryLines = record.subsidiaryBadges.map(badge => `- ${formatBadge(badge)}`);

    return [
        `RNGdle 🎲 ${record.rollText}`,
        '',
        formatRollRarity(record.rarity, record.percentileText),
        `${formatEp(record.totalEp)} EP`,
        `Lifetime EP: ${formatEp(lifetimeEp)}`,
        '',
        'Scoring badges:',
        ...(scoringLines.length ? scoringLines : ['None']),
        '',
        'Subsidiary badges:',
        ...(subsidiaryLines.length ? subsidiaryLines : ['None']),
        '',
        formatNextRollLine()
    ].join('\n');
}
