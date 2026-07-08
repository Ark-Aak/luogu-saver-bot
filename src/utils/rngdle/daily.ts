import { createHash } from 'crypto';
import { OFFICIAL_RNGDLE_ROLL_MAX, OFFICIAL_RNGDLE_ROLL_RANGE } from '@/utils/rngdle/official';

export const RNGDLE_MAX_ROLL = OFFICIAL_RNGDLE_ROLL_MAX;
export const RNGDLE_ROLL_RANGE = OFFICIAL_RNGDLE_ROLL_RANGE;

export function formatRollText(roll: number): string {
    return Math.max(0, Math.min(RNGDLE_MAX_ROLL, Math.trunc(roll))).toString();
}

export function getLocalDayKey(date = new Date()): string {
    return date.toISOString().split('T')[0];
}

export function getNextLocalMidnight(date = new Date()): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1, 0, 0, 0, 0));
}

export function getMillisUntilNextLocalMidnight(date = new Date()): number {
    return Math.max(0, getNextLocalMidnight(date).getTime() - date.getTime());
}

export function formatCountdown(ms: number): string {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m ${seconds
        .toString()
        .padStart(2, '0')}s`;
}

export function getDeterministicDailyRoll(userId: number, dayKey: string, rerollIndex = 0): number {
    const digest = createHash('sha256').update(`rngdle:v1:${userId}:${dayKey}:${rerollIndex}`).digest();
    return Number(digest.readBigUInt64BE(0) % BigInt(RNGDLE_ROLL_RANGE));
}
