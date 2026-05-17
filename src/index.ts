import 'reflect-metadata';

Date.prototype.toLocaleString = function () {
    const Y = this.getFullYear();
    const M = String(this.getMonth() + 1).padStart(2, '0');
    const D = String(this.getDate()).padStart(2, '0');
    const h = String(this.getHours()).padStart(2, '0');
    const m = String(this.getMinutes()).padStart(2, '0');
    const s = String(this.getSeconds()).padStart(2, '0');
    return `${Y}/${M}/${D} ${h}:${m}:${s}`;
};

import { client } from '@/napcat-client';

import { setupMessageHandler } from '@/handlers/message.handler';
import { scheduleGachaJobs } from '@/jobs/gacha';
import { scheduleGachaHintJobs } from '@/jobs/gacha-hint';
import { setupAntiSpamHandler } from '@/handlers/anti-spam.handler';
import { setupRegisteredMessageHandlers } from '@/handlers/registry';
import { setupImageModerationHandler } from '@/handlers/image-moderation.handler';
import { Moderation } from '@/utils/moderation';
import { startWebhookServer } from '@/server/webhook';
import { logger } from '@/utils/logger';

const INITIAL_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 60_000;
const RECONNECT_BACKOFF_MULTIPLIER = 2;

let appInitialized = false;
let reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
let reconnectTimer: NodeJS.Timeout | null = null;
let connecting = false;

function initializeApp() {
    if (appInitialized) return;

    startWebhookServer(client);
    Moderation.registerCaches();
    setupImageModerationHandler();
    setupMessageHandler();
    setupAntiSpamHandler();
    setupRegisteredMessageHandlers(client);
    scheduleGachaJobs(client);
    scheduleGachaHintJobs(client);
    appInitialized = true;
}

function scheduleReconnect() {
    if (reconnectTimer) return;

    const delay = reconnectDelayMs;
    reconnectDelayMs = Math.min(Math.round(reconnectDelayMs * RECONNECT_BACKOFF_MULTIPLIER), MAX_RECONNECT_DELAY_MS);
    logger.warn(`NapCat disconnected, reconnecting in ${delay}ms.`);
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        void connectWithBackoff();
    }, delay);
}

async function connectWithBackoff(): Promise<void> {
    if (connecting || client.isConnected()) return;

    connecting = true;
    try {
        await client.connect();
        reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
        initializeApp();
        logger.info('NapCat connected.');
    } catch (error) {
        logger.error('NapCat connect failed:', error as Error);
        scheduleReconnect();
    } finally {
        connecting = false;
    }
}

void connectWithBackoff();

client.on('disconnect', () => {
    scheduleReconnect();
});
