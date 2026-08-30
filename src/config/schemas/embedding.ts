import { z } from 'zod';

const DEFAULT_EMBEDDING_CONFIG = {
    endpoint: '',
    apiKey: '',
    model: 'text-embedding-3-small',
    requestTimeoutMs: 15_000,
    decayHalfLifeMs: 30 * 24 * 60 * 60 * 1000,
    guessMinEffectiveWeight: 3
} as const;

export const EmbeddingSchema = z
    .object({
        endpoint: z.union([z.literal(''), z.string().url()]).default(DEFAULT_EMBEDDING_CONFIG.endpoint),
        apiKey: z.string().default(DEFAULT_EMBEDDING_CONFIG.apiKey),
        model: z.string().trim().min(1).default(DEFAULT_EMBEDDING_CONFIG.model),
        requestTimeoutMs: z.number().int().positive().default(DEFAULT_EMBEDDING_CONFIG.requestTimeoutMs),
        decayHalfLifeMs: z.number().int().positive().default(DEFAULT_EMBEDDING_CONFIG.decayHalfLifeMs),
        guessMinEffectiveWeight: z.number().nonnegative().default(DEFAULT_EMBEDDING_CONFIG.guessMinEffectiveWeight)
    })
    .default(DEFAULT_EMBEDDING_CONFIG);
