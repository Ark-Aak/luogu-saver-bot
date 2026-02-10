import { z } from 'zod';
export const SaverSchema = z.object({
    token: z.string().length(32).default('')
});
