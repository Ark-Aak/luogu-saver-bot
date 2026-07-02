import { z } from 'zod';

export const GroupSchema = z
    .object({
        autoApproveKeywords: z.array(z.string()).default([])
    })
    .default({ autoApproveKeywords: [] });
