import { z } from 'zod';

export const QaSchema = z.object({
    endpoint: z.string().url().default('https://api.openai.com/v1/chat/completions'),
    model: z.string().default('gpt-4o-mini'),
    apiKey: z.string().default(''),
    temperature: z.number().min(0).max(2).default(0.2),
    maxTokens: z.number().int().positive().default(1024),
    maxKnowledgeItems: z.number().int().positive().default(20)
});
