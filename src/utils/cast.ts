export function toNumber(value: unknown, fallback = 0): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function toString(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value : fallback;
}
