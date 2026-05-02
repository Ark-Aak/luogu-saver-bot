import { z } from 'zod';

export const AliyunSchema = z.object({
    accessKeyId: z.string().min(1, 'Access Key ID is required'),
    accessKeySecret: z.string().min(1, 'Access Key Secret is required'),
    endpoint: z.string().default('green-cip.cn-shanghai.aliyuncs.com'),
    imageModerationService: z.string().default('baselineCheckVL'),
    imageModerationEnabled: z.boolean().default(true),
    imageModerationBlockRiskLevels: z.array(z.string()).default(['high']),
    imageModerationCacheTtlMs: z
        .number()
        .int()
        .nonnegative()
        .default(10 * 60 * 1000),
    imageModerationHashCacheEnabled: z.boolean().default(true),
    imageModerationDownloadTimeoutMs: z.number().int().positive().default(10_000),
    imageModerationMaxDownloadBytes: z
        .number()
        .int()
        .positive()
        .default(10 * 1024 * 1024)
});
