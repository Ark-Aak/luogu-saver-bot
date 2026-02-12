import { z } from 'zod';

export const AntiSpamSchema = z.object({
    enabled: z.boolean().default(true),
    historySize: z.number().min(1).default(5),
    similarityThreshold: z.number().min(0).max(1).default(0.8),
    minContentLength: z.number().min(1).default(3),
    floodTimeWindow: z.number().min(1).default(5000),
    floodMaxCount: z.number().min(1).default(4),
    warningLevelDecayPeriod: z
        .number()
        .min(1)
        .default(1000 * 60 * 30)
});
