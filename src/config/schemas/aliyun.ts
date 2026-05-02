import { z } from 'zod';

export const AliyunSchema = z.object({
    accessKeyId: z.string().min(1, 'Access Key ID is required'),
    accessKeySecret: z.string().min(1, 'Access Key Secret is required'),
    endpoint: z.string().default('green-cip.cn-shanghai.aliyuncs.com'),
    imageModerationService: z.string().default('baselineCheck'),
    imageModerationEnabled: z.boolean().default(true),
    imageModerationBlockRiskLevels: z.array(z.string()).default(['high'])
});
