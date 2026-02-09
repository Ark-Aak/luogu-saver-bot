import { z } from 'zod';

export const AliyunSchema = z.object({
    accessKeyId: z.string().min(1, 'Access Key ID is required'),
    accessKeySecret: z.string().min(1, 'Access Key Secret is required')
});
