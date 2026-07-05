import { z } from 'zod';

const RARITY_ORDER = ['trash', 'common', 'uncommon', 'rare', 'epic', 'anomaly', 'mythic'] as const;

export const DEFAULT_RNGDLE_RARITY_MIN_PERCENT = {
    trash: 0,
    common: 1,
    uncommon: 50,
    rare: 75,
    epic: 90,
    anomaly: 95,
    mythic: 99
} as const;

const PercentSchema = z.number().min(0).max(100);

const RarityMinPercentSchema = z
    .object({
        trash: PercentSchema.default(DEFAULT_RNGDLE_RARITY_MIN_PERCENT.trash),
        common: PercentSchema.default(DEFAULT_RNGDLE_RARITY_MIN_PERCENT.common),
        uncommon: PercentSchema.default(DEFAULT_RNGDLE_RARITY_MIN_PERCENT.uncommon),
        rare: PercentSchema.default(DEFAULT_RNGDLE_RARITY_MIN_PERCENT.rare),
        epic: PercentSchema.default(DEFAULT_RNGDLE_RARITY_MIN_PERCENT.epic),
        anomaly: PercentSchema.default(DEFAULT_RNGDLE_RARITY_MIN_PERCENT.anomaly),
        mythic: PercentSchema.default(DEFAULT_RNGDLE_RARITY_MIN_PERCENT.mythic)
    })
    .default(DEFAULT_RNGDLE_RARITY_MIN_PERCENT)
    .superRefine((value, context) => {
        for (let index = 1; index < RARITY_ORDER.length; index += 1) {
            const previous = RARITY_ORDER[index - 1];
            const current = RARITY_ORDER[index];
            if (value[current] < value[previous]) {
                context.addIssue({
                    code: 'custom',
                    path: [current],
                    message: `${current} must be greater than or equal to ${previous}`
                });
            }
        }
    });

export const RngdleSchema = z
    .object({
        rarityMinPercent: RarityMinPercentSchema
    })
    .default({ rarityMinPercent: DEFAULT_RNGDLE_RARITY_MIN_PERCENT });
