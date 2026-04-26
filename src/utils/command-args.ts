import { getUserTargetId } from '@/utils/user-target';

export type ArgNormalizer = (args: string[]) => string[] | null;

export function normalizeUserTargets(...positions: number[]): ArgNormalizer {
    return args => {
        const normalized = [...args];
        for (const position of positions) {
            if (position >= normalized.length) continue;

            const userId = getUserTargetId(normalized[position]);
            if (userId === null) {
                return null;
            }

            normalized[position] = String(userId);
        }

        return normalized;
    };
}

export function normalizeConditionalUserTargets(
    predicate: (args: string[]) => boolean,
    ...positions: number[]
): ArgNormalizer {
    return args => (predicate(args) ? normalizeUserTargets(...positions)(args) : args);
}

export function composeArgNormalizers(...normalizers: ArgNormalizer[]): ArgNormalizer {
    return args => {
        let normalized: string[] | null = args;
        for (const normalizer of normalizers) {
            normalized = normalizer(normalized);
            if (!normalized) return null;
        }
        return normalized;
    };
}

export function normalizeSubcommandUserTargets(
    subcommand: string,
    positionsByLength: Record<number, number[]>
): ArgNormalizer {
    return args => {
        if (args[0] !== subcommand) {
            return args;
        }

        const positions = positionsByLength[args.length];
        return positions ? normalizeUserTargets(...positions)(args) : args;
    };
}
