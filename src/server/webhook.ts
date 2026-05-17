import { createServer, IncomingMessage, ServerResponse } from 'http';
import { NapLink } from '@naplink/naplink';
import { config } from '@/config';
import { handleGitHubWebhook } from '@/handlers/github.handler';
import { logger } from '@/utils/logger';

const MAX_BODY_SIZE = 1024 * 1024;

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
    response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(body));
}

function readBody(request: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        let body = '';

        request.on('data', chunk => {
            body += chunk;
            if (Buffer.byteLength(body) > MAX_BODY_SIZE) {
                reject(new Error('Body is too large.'));
                request.destroy();
            }
        });

        request.on('end', () => resolve(body));
        request.on('error', reject);
    });
}

export function startWebhookServer(client: NapLink): void {
    const server = createServer(async (request, response) => {
        const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
        if (request.method !== 'POST' || url.pathname !== config.webhook.path) {
            sendJson(response, 404, { success: false, message: 'not found' });
            return;
        }

        try {
            const rawBody = await readBody(request);
            const payload = rawBody ? JSON.parse(rawBody) : null;
            await handleGitHubWebhook(client, {
                event: String(request.headers['x-github-event'] ?? ''),
                delivery: String(request.headers['x-github-delivery'] ?? ''),
                payload
            });
            sendJson(response, 200, { success: true });
        } catch (error) {
            logger.error('Failed to handle GitHub webhook:', error);
            sendJson(response, 400, { success: false, message: 'bad request' });
        }
    });

    server.listen(config.webhook.port, config.webhook.host, () => {
        logger.info(
            `GitHub webhook server listening on http://${config.webhook.host}:${config.webhook.port}${config.webhook.path}`
        );
    });
}
