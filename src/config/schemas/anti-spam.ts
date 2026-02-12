import { z } from 'zod';

export const AntiSpamSchema = z.object({
    enabled: z.boolean().default(true),
    historySize: z.number().min(1).default(10),
    floodTimeWindow: z.number().min(1).default(5000),
    floodMaxCount: z.number().min(1).default(4),
    repeatThreshold: z.number().min(1).default(3),
    messageRecordDuration: z.number().min(1).default(1000 * 60 * 10),
    warningLevelDecayPeriod: z
        .number()
        .min(1)
        .default(1000 * 60 * 30),
    banDurationBase: z.number().min(1).default(60),
    banMultiplier: z.number().min(1).default(2)
});
