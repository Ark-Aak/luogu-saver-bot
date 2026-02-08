import { z } from 'zod';

export const NapcatSchema = z.object({
    url: z.string().default('ws://localhost:6000'),
    token: z.string().default(''),
    superuser: z.array(z.number()).default([]),
});
