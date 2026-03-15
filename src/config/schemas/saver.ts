import { z } from 'zod';

export const SaverSchema = z.object({
    token: z.string().default(''),
    newApiBaseUrl: z.string().url().default('https://ai.luogu.me'),
    newApiAccessToken: z.string().default(''),
    newApiUserId: z.number().int().nonnegative().default(0),
    selfRechargeDailyLimitUsd: z.number().positive().default(5),
    dailyLimitTimezone: z.string().default('Asia/Shanghai')
});
