import { createHash } from 'crypto';

export const RNGDLE_MAX_ROLL = 999_999;
export const RNGDLE_ROLL_RANGE = RNGDLE_MAX_ROLL + 1;

export function formatRollText(roll: number): string {
    return Math.max(0, Math.min(RNGDLE_MAX_ROLL, Math.trunc(roll)))
        .toString()
        .padStart(6, '0');
}

export function getLocalDayKey(date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function getNextLocalMidnight(date = new Date()): Date {
    const next = new Date(date);
    next.setHours(24, 0, 0, 0);
    return next;
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

export function getDeterministicDailyRoll(userId: number, dayKey: string): number {
    const digest = createHash('sha256').update(`rngdle:v1:${userId}:${dayKey}`).digest();
    return Number(digest.readBigUInt64BE(0) % BigInt(RNGDLE_ROLL_RANGE));
}
