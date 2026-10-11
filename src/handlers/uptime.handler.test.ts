import assert from 'node:assert/strict';
import { createHmac, createSecretKey, randomBytes } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import test from 'node:test';
import type { TestContext } from 'node:test';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@/db/schema';
import { UptimeWebhookReceiver } from '@/handlers/uptime.handler';
import type { UptimeWebhookReceiverOptions, UptimeWebhookSettings } from '@/handlers/uptime.handler';
import type { UptimeWebhookEvent } from '@/types/uptime-webhook';
import type { SendMessageResult } from '@/utils/client';
import { setModuleEnabled } from '@/utils/module-toggle';
import { verifyUptimeWebhookRequest } from '@/utils/uptime-webhook';

const NOW = Date.parse('2026-10-11T12:00:00.000Z');
const TIMESTAMP = NOW / 1000;

function fixture(t: TestContext) {
    const sqlite = new Database(':memory:');
    t.after(() => {
        if (sqlite.open) sqlite.close();
    });
    sqlite.exec(`
        CREATE TABLE group_module_toggles (
            id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
            group_id INTEGER NOT NULL,
            module_name TEXT NOT NULL,
            enabled INTEGER DEFAULT 1 NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE UNIQUE INDEX group_module_toggles_group_module_unique ON group_module_toggles (group_id, module_name);
        CREATE TABLE uptime_webhook_receipts (
            id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
            event_id TEXT NOT NULL,
            recipient_type TEXT NOT NULL,
            recipient_id INTEGER NOT NULL,
            delivered_at INTEGER NOT NULL
        );
        CREATE UNIQUE INDEX uptime_webhook_receipts_event_recipient_unique
            ON uptime_webhook_receipts (event_id, recipient_type, recipient_id);
    `);
    const database = drizzle(sqlite, { schema });
    const key = createSecretKey(randomBytes(32));
    const event: UptimeWebhookEvent = {
        schemaVersion: 1,
        eventId: '11111111-1111-4111-8111-111111111111',
        eventType: 'probe.host_alert.opened',
        occurredAt: '2026-10-11T12:00:00.000Z',
        probe: {
            id: '22222222-2222-4222-8222-222222222222',
            name: '公共探针 [CQ:at,qq=all]',
            kind: 'remote',
            mode: 'host'
        },
        alert: {
            id: '33333333-3333-4333-8333-333333333333',
            kind: 'memory',
            status: 'open',
            openedAt: '2026-10-11T12:00:00.000Z',
            resolvedAt: null,
            resolution: null,
            value: 95,
            valueUnit: 'percent',
            openThreshold: 90,
            resolveThreshold: 75,
            openAfterSeconds: 60,
            resolveAfterSeconds: 120
        }
    };
    const body = Buffer.from(JSON.stringify(event));
    function headersFor(rawBody: Buffer = body, timestamp = TIMESTAMP): IncomingHttpHeaders {
        return {
            'x-oh-my-uptime-event-id': event.eventId,
            'x-oh-my-uptime-timestamp': String(timestamp),
            'x-oh-my-uptime-signature': `v1=${createHmac('sha256', key).update(`${timestamp}.`).update(rawBody).digest('hex')}`
        };
    }
    const settings: UptimeWebhookSettings = {
        webhook: { enabled: true, path: '/uptime', secretFile: '', notifyGroups: [101], notifyUsers: [] },
        enabledGroupIds: null
    };
    function receiver(senders: Pick<UptimeWebhookReceiverOptions, 'sendGroup' | 'sendPrivate'>) {
        return new UptimeWebhookReceiver({
            ...senders,
            database,
            getSettings: () => settings,
            now: () => NOW,
            verifier: { verify: (rawBody, headers) => verifyUptimeWebhookRequest(rawBody, headers, () => key, NOW) }
        });
    }
    return { sqlite, database, body, headersFor, settings, receiver };
}

test('invalid, stale, malformed and disabled requests never reach QQ or write receipts', async t => {
    const f = fixture(t);
    let sends = 0;
    const send = async () => {
        sends++;
        return { message_id: sends };
    };
    const receiver = f.receiver({ sendGroup: send, sendPrivate: send });
    const headers = f.headersFor();
    await assert.rejects(receiver.receive(f.body, { ...headers, 'x-oh-my-uptime-signature': `v1=${'0'.repeat(64)}` }), {
        statusCode: 401
    });
    await assert.rejects(receiver.receive(f.body, f.headersFor(f.body, TIMESTAMP - 301)), { statusCode: 401 });
    const malformed = Buffer.from('{}');
    await assert.rejects(receiver.receive(malformed, f.headersFor(malformed)), { statusCode: 400 });
    await assert.rejects(
        receiver.receive(f.body, {
            ...headers,
            'x-oh-my-uptime-event-id': '44444444-4444-4444-8444-444444444444'
        }),
        { statusCode: 400 }
    );
    f.settings.webhook.enabled = false;
    await assert.rejects(receiver.receive(f.body, headers), { statusCode: 404 });
    assert.equal(sends, 0);
    assert.equal(f.database.select().from(schema.uptimeWebhookReceipts).all().length, 0);
});

test('recipient uniqueness, enabled group list and per-group switches control actual deliveries', async t => {
    const f = fixture(t);
    f.settings.webhook.notifyGroups = [101, 101, 202, 303];
    f.settings.webhook.notifyUsers = [101, 404, 404];
    f.settings.enabledGroupIds = [101, 202];
    await setModuleEnabled(202, 'uptime-webhook', false, f.database);
    const groups: number[] = [];
    const users: number[] = [];
    const receiver = f.receiver({
        sendGroup: async id => {
            groups.push(id);
            return { message_id: groups.length };
        },
        sendPrivate: async id => {
            users.push(id);
            return { message_id: users.length };
        }
    });
    await receiver.receive(f.body, f.headersFor());
    assert.deepEqual(groups, [101]);
    assert.deepEqual(users, [101, 404]);
    assert.equal(f.database.select().from(schema.uptimeWebhookReceipts).all().length, 3);

    await setModuleEnabled(202, 'uptime-webhook', true, f.database);
    f.settings.enabledGroupIds = [101, 202, 303];
    await receiver.receive(f.body, f.headersFor());
    assert.deepEqual(
        groups.slice().sort((a, b) => a - b),
        [101, 202, 303]
    );
    assert.deepEqual(users, [101, 404]);
    assert.equal(f.database.select().from(schema.uptimeWebhookReceipts).all().length, 5);
});

test('single flight coalesces concurrent valid requests and writes only after the QQ response', async t => {
    const f = fixture(t);
    let calls = 0;
    let release!: () => void;
    let announceStarted!: () => void;
    const gate = new Promise<void>(resolve => {
        release = resolve;
    });
    const started = new Promise<void>(resolve => {
        announceStarted = resolve;
    });
    const receiver = f.receiver({
        sendGroup: async () => {
            calls++;
            announceStarted();
            await gate;
            return { message_id: 10 };
        },
        sendPrivate: async () => {
            throw new Error('unexpected private send');
        }
    });
    const requests = Array.from({ length: 12 }, () => receiver.receive(f.body, f.headersFor()));
    await started;
    assert.equal(calls, 1);
    assert.equal(f.database.select().from(schema.uptimeWebhookReceipts).all().length, 0);
    await assert.rejects(
        receiver.receive(f.body, {
            ...f.headersFor(),
            'x-oh-my-uptime-signature': `v1=${'0'.repeat(64)}`
        }),
        { statusCode: 401 }
    );
    release();
    await Promise.all(requests);
    assert.equal(calls, 1);
    const receipts = f.database.select().from(schema.uptimeWebhookReceipts).all();
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].deliveredAt, NOW);
    await receiver.receive(f.body, f.headersFor());
    assert.equal(calls, 1);
});

test('partial failure returns retryable failure and a recreated receiver retries only unrecorded recipients', async t => {
    const f = fixture(t);
    f.settings.webhook.notifyGroups = [101, 202];
    f.settings.webhook.notifyUsers = [303];
    const attempts = new Map<number, number>();
    let failing = true;
    const send = async (id: number) => {
        attempts.set(id, (attempts.get(id) ?? 0) + 1);
        if (id === 202 && failing) throw new Error('simulated QQ failure');
        return { message_id: id };
    };
    const first = f.receiver({ sendGroup: send, sendPrivate: send });
    await assert.rejects(Promise.all([first.receive(f.body, f.headersFor()), first.receive(f.body, f.headersFor())]), {
        statusCode: 503
    });
    assert.equal(f.database.select().from(schema.uptimeWebhookReceipts).all().length, 2);
    assert.equal(attempts.get(101), 1);
    assert.equal(attempts.get(202), 1);
    assert.equal(attempts.get(303), 1);
    failing = false;
    const recreated = f.receiver({ sendGroup: send, sendPrivate: send });
    await recreated.receive(f.body, f.headersFor());
    await recreated.receive(f.body, f.headersFor());
    assert.equal(attempts.get(101), 1);
    assert.equal(attempts.get(202), 2);
    assert.equal(attempts.get(303), 1);
    assert.equal(f.database.select().from(schema.uptimeWebhookReceipts).all().length, 3);
});

test('a null disabled-group send is skipped without receipt and can deliver on a later retry', async t => {
    const f = fixture(t);
    let disabled = true;
    let attempts = 0;
    const receiver = f.receiver({
        sendGroup: async () => {
            attempts++;
            return disabled ? null : { message_id: 42 };
        },
        sendPrivate: async () => {
            throw new Error('unexpected private send');
        }
    });
    await receiver.receive(f.body, f.headersFor());
    assert.equal(attempts, 1);
    assert.equal(f.database.select().from(schema.uptimeWebhookReceipts).all().length, 0);
    disabled = false;
    await receiver.receive(f.body, f.headersFor());
    assert.equal(attempts, 2);
    assert.equal(f.database.select().from(schema.uptimeWebhookReceipts).all().length, 1);
});

test('unconfirmed QQ responses do not create receipts or acknowledge a private delivery', async t => {
    const f = fixture(t);
    f.settings.webhook.notifyGroups = [];
    f.settings.webhook.notifyUsers = [202];
    for (const response of [null, undefined, {}, { message_id: NaN }, { message_id: 1.5 }]) {
        const receiver = f.receiver({
            sendGroup: async () => {
                throw new Error('unexpected group send');
            },
            sendPrivate: async () => response as SendMessageResult
        });
        await assert.rejects(receiver.receive(f.body, f.headersFor()), { statusCode: 503 });
        assert.equal(f.database.select().from(schema.uptimeWebhookReceipts).all().length, 0);
    }
});

test('a receipt write failure remains retryable and exposes the unavoidable send-receipt crash window', async t => {
    const f = fixture(t);
    f.sqlite.exec(`CREATE TRIGGER fail_receipt BEFORE INSERT ON uptime_webhook_receipts
        BEGIN SELECT RAISE(ABORT, 'simulated receipt failure'); END;`);
    let sends = 0;
    const receiver = f.receiver({
        sendGroup: async () => {
            sends++;
            return { message_id: sends };
        },
        sendPrivate: async () => {
            throw new Error('unexpected private send');
        }
    });
    await assert.rejects(receiver.receive(f.body, f.headersFor()), { statusCode: 503 });
    assert.equal(sends, 1);
    assert.equal(f.database.select().from(schema.uptimeWebhookReceipts).all().length, 0);
    f.sqlite.exec('DROP TRIGGER fail_receipt');
    await receiver.receive(f.body, f.headersFor());
    assert.equal(sends, 2);
    assert.equal(f.database.select().from(schema.uptimeWebhookReceipts).all().length, 1);
});
