import { z } from 'zod';

export const EmailSchema = z.object({
    resendSecret: z.string().default(''),
    defaultSender: z.string().default('')
});
