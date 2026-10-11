import { createServer } from 'http';
import type { IncomingMessage, ServerResponse, Server } from 'http';
import type { NapLink } from '@naplink/naplink';
import { config } from '@/config';
import { db } from '@/db';
import { handleGitHubWebhook } from '@/handlers/github.handler';
import { UptimeWebhookReceiver } from '@/handlers/uptime.handler';
import { sendGroupMessage, sendPrivateMessage } from '@/utils/client';
import { logger } from '@/utils/logger';
import { UptimeWebhookError } from '@/utils/uptime-webhook';

const MAX_BODY_SIZE = 1024 * 1024;

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
    response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(body));
}

function readBody(request: IncomingMessage): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let length = 0;
        let oversized = false;

        request.on('data', chunk => {
            if (oversized) return;
            const bytes: Buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            length += bytes.length;
            if (length > MAX_BODY_SIZE) {
                oversized = true;
                chunks.length = 0;
                reject(new UptimeWebhookError(413, 'request body too large'));
                return;
            }
            chunks.push(bytes);
        });

        request.on('end', () => {
            if (!oversized) resolve(Buffer.concat(chunks, length));
        });
        request.on('aborted', () => reject(new UptimeWebhookError(400, 'incomplete request body')));
        request.on('error', reject);
    });
}

export function startWebhookServer(client: NapLink): Server {
    const uptimeReceiver = new UptimeWebhookReceiver({
        database: db,
        getSettings: () => ({
            webhook: config.uptime.webhook,
            enabledGroupIds: config.group.enabledGroupIds
        }),
        sendGroup: (groupId, message) => sendGroupMessage(client, groupId, message, true),
        sendPrivate: (userId, message) => sendPrivateMessage(client, userId, message, true)
    });
    const server = createServer(async (request, response) => {
        let uptimeRoute = false;
        try {
            const url = new URL(request.url ?? '/', 'http://localhost');
            uptimeRoute = config.uptime.webhook.enabled && url.pathname === config.uptime.webhook.path;
            if (request.method !== 'POST' || (!uptimeRoute && url.pathname !== config.webhook.path)) {
                sendJson(response, 404, { success: false, message: 'not found' });
                return;
            }
            const rawBody = await readBody(request);
            if (uptimeRoute) {
                await uptimeReceiver.receive(rawBody, request.headers);
            } else {
                await handleGitHubWebhook(client, {
                    event: String(request.headers['x-github-event'] ?? ''),
                    delivery: String(request.headers['x-github-delivery'] ?? ''),
                    payload: rawBody.length ? JSON.parse(rawBody.toString('utf8')) : null
                });
            }
            sendJson(response, 200, { success: true });
        } catch (error) {
            const statusCode = error instanceof UptimeWebhookError ? error.statusCode : uptimeRoute ? 503 : 400;
            if (uptimeRoute && statusCode === 503)
                logger.error('Uptime webhook delivery or verification is unavailable.');
            if (!uptimeRoute) logger.error('Failed to handle GitHub webhook.');
            if (statusCode === 413) response.shouldKeepAlive = false;
            if (!response.destroyed) {
                sendJson(response, statusCode, {
                    success: false,
                    message:
                        error instanceof UptimeWebhookError
                            ? error.message
                            : statusCode === 503
                              ? 'service unavailable'
                              : 'bad request'
                });
            }
        }
    });

    server.listen(config.webhook.port, config.webhook.host, () => {
        logger.info(`Webhook server listening on http://${config.webhook.host}:${config.webhook.port}`);
    });
    return server;
}
