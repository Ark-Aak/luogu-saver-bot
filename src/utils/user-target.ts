import { AtSegment } from '@/types/message';
import { MessageBuilder } from '@/utils/message-builder';

function isPositiveIntegerTarget(target: string): boolean {
    return /^\d+$/.test(target);
}

export type UserTargetKind = 'qq' | 'at';

export type UserTarget = {
    id: number;
    kind: UserTargetKind;
};

export function parseUserTarget(target: string): UserTarget | null {
    if (isPositiveIntegerTarget(target)) {
        return { id: parseInt(target, 10), kind: 'qq' };
    }

    const segments = new MessageBuilder().cqCode(target).build();
    if (segments.length !== 1 || segments[0].type !== 'at') {
        return null;
    }

    const qq = (segments[0] as AtSegment).data.qq;
    if (qq === 'all' || !isPositiveIntegerTarget(qq)) {
        return null;
    }

    return { id: parseInt(qq, 10), kind: 'at' };
}

export function isValidUserTarget(target: string): boolean {
    return parseUserTarget(target) !== null;
}

export function getUserTargetId(target: string): number | null {
    return parseUserTarget(target)?.id ?? null;
}

export function isLikelyQqId(target: string): boolean {
    return /^\d{5,12}$/.test(target);
}
