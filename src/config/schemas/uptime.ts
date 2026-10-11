import { isAbsolute } from 'node:path';
import { z } from 'zod';

const originSchema = z.union([z.literal(''), z.url({ protocol: /^https?$/ })]).refine(value => {
    if (!value) return true;
    try {
        const url = new URL(value);
        return !url.username && !url.password && !url.search && !url.hash && url.pathname === '/';
    } catch {
        return false;
    }
}, 'Uptime baseUrl must be an HTTP(S) origin without credentials, path, query or fragment.');

const webhookSchema = z
    .object({
        enabled: z.boolean().default(false),
        path: z
            .string()
            .regex(/^\/(?!\/)[^?#\s]*$/)
            .default('/uptime'),
        secretFile: z
            .string()
            .refine(value => value === '' || isAbsolute(value), 'Use an absolute secret file path.')
            .default(''),
        notifyGroups: z.array(z.number().int().positive().safe()).default([]),
        notifyUsers: z.array(z.number().int().positive().safe()).default([])
    })
    .superRefine((value, context) => {
        if (!value.enabled) return;
        if (!value.secretFile) {
            context.addIssue({
                code: 'custom',
                path: ['secretFile'],
                message: 'An enabled uptime webhook requires a secret file.'
            });
        }
        if (value.notifyGroups.length === 0 && value.notifyUsers.length === 0) {
            context.addIssue({
                code: 'custom',
                path: ['notifyGroups'],
                message: 'An enabled uptime webhook requires a QQ recipient.'
            });
        }
    })
    .prefault({});

export const UptimeSchema = z
    .object({
        baseUrl: originSchema.default(''),
        statusPageSlug: z
            .union([
                z.literal(''),
                z
                    .string()
                    .trim()
                    .regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/)
            ])
            .default(''),
        requestTimeoutMs: z.number().int().positive().max(30_000).default(10_000),
        webhook: webhookSchema
    })
    .prefault({});

export type UptimeConfig = z.infer<typeof UptimeSchema>;
