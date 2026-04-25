import { z } from 'zod';

export const EmailSchema = z.object({
    resendSecret: z.string().default(''),
    defaultSender: z.string().default(''),
    verificationCooldownMs: z.number().int().nonnegative().default(120_000),
    verificationExpireMs: z.number().int().positive().default(600_000)
});
