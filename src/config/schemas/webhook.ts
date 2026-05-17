import { z } from 'zod';

export const WebhookSchema = z.object({
    host: z.string().default('127.0.0.1'),
    port: z.number().int().positive().default(3000),
    path: z.string().default('/github'),
    notifyGroups: z.array(z.number()).default([]),
    notifyUsers: z.array(z.number()).default([]),
    debounceMs: z.number().int().nonnegative().default(3000),
    maxPushCommits: z.number().int().positive().default(8)
});
