import { createHmac, createSecretKey, timingSafeEqual } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import type { BigIntStats } from 'node:fs';
import type { IncomingHttpHeaders } from 'node:http';
import { isAbsolute } from 'node:path';
import { TextDecoder } from 'node:util';
import { UptimeWebhookEventSchema } from '@/types/uptime-webhook';
import type { UptimeWebhookEvent } from '@/types/uptime-webhook';

const MAX_SECRET_FILE_BYTES = 256;
const TIMESTAMP_TOLERANCE_SECONDS = 300;
const SECRET_PATTERN = /^omuh_([A-Za-z0-9_-]{43})(?:\r?\n)?$/;

export class UptimeWebhookError extends Error {
    constructor(
        readonly statusCode: number,
        message: string
    ) {
        super(message);
        this.name = 'UptimeWebhookError';
    }
}

export function verifyUptimeWebhookRequest(
    rawBody: Buffer,
    headers: IncomingHttpHeaders,
    getKey: () => KeyObject,
    nowMilliseconds: number = Date.now()
): UptimeWebhookEvent {
    const timestampHeader = headers['x-oh-my-uptime-timestamp'];
    const signatureHeader = headers['x-oh-my-uptime-signature'];
    const eventIdHeader = headers['x-oh-my-uptime-event-id'];
    if (
        typeof timestampHeader !== 'string' ||
        !/^(?:0|[1-9]\d{0,15})$/.test(timestampHeader) ||
        !Number.isSafeInteger(Number(timestampHeader)) ||
        typeof eventIdHeader !== 'string' ||
        !eventIdHeader
    ) {
        throw new UptimeWebhookError(400, 'invalid webhook headers');
    }
    const signature = typeof signatureHeader === 'string' ? /^v1=([a-fA-F0-9]{64})$/.exec(signatureHeader) : null;
    if (!signature) throw new UptimeWebhookError(401, 'invalid webhook signature');
    if (Math.abs(Math.floor(nowMilliseconds / 1000) - Number(timestampHeader)) > TIMESTAMP_TOLERANCE_SECONDS) {
        throw new UptimeWebhookError(401, 'expired webhook timestamp');
    }

    const digest = createHmac('sha256', getKey())
        .update(timestampHeader, 'utf8')
        .update('.', 'utf8')
        .update(rawBody)
        .digest();
    if (!timingSafeEqual(digest, Buffer.from(signature[1]!, 'hex'))) {
        throw new UptimeWebhookError(401, 'invalid webhook signature');
    }

    let payload: unknown;
    try {
        payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(rawBody));
    } catch {
        throw new UptimeWebhookError(400, 'invalid webhook body');
    }
    const parsed = UptimeWebhookEventSchema.safeParse(payload);
    if (!parsed.success || parsed.data.eventId !== eventIdHeader) {
        throw new UptimeWebhookError(400, 'invalid webhook event');
    }
    return parsed.data;
}

export class UptimeWebhookVerifier {
    #cached: { filePath: string; stats: BigIntStats; key: KeyObject } | undefined;
    readonly #now: () => number;

    constructor(now: () => number = Date.now) {
        this.#now = now;
    }

    verify(rawBody: Buffer, headers: IncomingHttpHeaders, secretFile: string): UptimeWebhookEvent {
        return verifyUptimeWebhookRequest(rawBody, headers, () => this.#loadKey(secretFile), this.#now());
    }

    #loadKey(filePath: string): KeyObject {
        let file: number | undefined;
        let content: Buffer | undefined;
        let decoded: Buffer | undefined;
        try {
            if (!isAbsolute(filePath)) throw new Error();
            file = openSync(filePath, constants.O_RDONLY | constants.O_NONBLOCK);
            const stats = fstatSync(file, { bigint: true });
            if (!stats.isFile() || stats.size > BigInt(MAX_SECRET_FILE_BYTES)) throw new Error();
            const cached = this.#cached;
            if (
                cached?.filePath === filePath &&
                cached.stats.dev === stats.dev &&
                cached.stats.ino === stats.ino &&
                cached.stats.size === stats.size &&
                cached.stats.mtimeNs === stats.mtimeNs &&
                cached.stats.ctimeNs === stats.ctimeNs
            ) {
                return cached.key;
            }

            content = Buffer.alloc(MAX_SECRET_FILE_BYTES + 1);
            let length = 0;
            while (length < content.length) {
                const read = readSync(file, content, length, content.length - length, length);
                if (read === 0) break;
                length += read;
            }
            const afterRead = fstatSync(file, { bigint: true });
            if (
                length > MAX_SECRET_FILE_BYTES ||
                afterRead.size !== stats.size ||
                afterRead.mtimeNs !== stats.mtimeNs ||
                afterRead.ctimeNs !== stats.ctimeNs
            ) {
                throw new Error();
            }
            const match = SECRET_PATTERN.exec(content.subarray(0, length).toString('utf8'));
            if (!match) throw new Error();
            decoded = Buffer.from(match[1]!, 'base64url');
            if (decoded.length !== 32) throw new Error();
            const key = createSecretKey(decoded);
            this.#cached = { filePath, stats, key };
            return key;
        } catch {
            this.#cached = undefined;
            throw new UptimeWebhookError(503, 'webhook verification unavailable');
        } finally {
            content?.fill(0);
            decoded?.fill(0);
            if (file !== undefined) closeSync(file);
        }
    }
}
