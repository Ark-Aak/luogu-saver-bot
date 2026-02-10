import { z } from 'zod';

export const CommandSchema = z.object({
    prefix: z.string().default('/')
});
