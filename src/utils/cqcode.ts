import { getUserTargetId } from '@/utils/user-target';

export function getUserId(cqcode: string): number | null {
    return getUserTargetId(cqcode);
}
