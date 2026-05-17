import { z } from 'zod';

export const WebhookSchema = z.object({
    host: z.string().default('127.0.0.1'),
    port: z.number().int().positive().default(3000),
    path: z.string().default('/github')
});
