import assert from 'node:assert/strict';
import { createHmac, createSecretKey, randomBytes, randomUUID } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import test from 'node:test';
import type { TestContext } from 'node:test';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@/db/schema';
import { UptimeWebhookReceiver } from '@/handlers/uptime.handler';
import type { UptimeWebhookReceiverOptions, UptimeWebhookSettings } from '@/handlers/uptime.handler';
import type { HostAlertWebhookEvent, MonitorIncidentWebhookEvent, UptimeWebhookEvent } from '@/types/uptime-webhook';
import type { SendMessageResult } from '@/utils/client';
import { setModuleEnabled } from '@/utils/module-toggle';
import { verifyUptimeWebhookRequest } from '@/utils/uptime-webhook';

const NOW = Date.parse('2026-10-11T12:00:00.000Z');
const TIMESTAMP = NOW / 1000;
const MONITOR_NAME = '官网 [CQ:at,qq=all]';
const MONITOR_ID = '55555555-5555-4555-8555-555555555555';
const INCIDENT_ID = '66666666-6666-4666-8666-666666666666';

type MonitorIncidentResolvedEvent = Extract<MonitorIncidentWebhookEvent, { eventType: 'monitor.incident.resolved' }>;

function hostAlertEvent(): HostAlertWebhookEvent {
    return {
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
}

function serviceOpenedEvent(
    state: MonitorIncidentWebhookEvent['monitor']['state'] = 'degraded'
): MonitorIncidentWebhookEvent {
    return {
        schemaVersion: 1,
        eventId: randomUUID(),
        eventType: 'monitor.incident.opened',
        occurredAt: '2026-10-11T11:00:00.000Z',
        monitor: { id: MONITOR_ID, name: MONITOR_NAME, kind: 'http', state },
        incident: {
            id: INCIDENT_ID,
            status: 'ongoing',
            openedAt: '2026-10-11T11:00:00.000Z',
            resolvedAt: null,
            resolution: null,
            durationSeconds: 0
        }
    };
}

function serviceResolvedEvent(
    resolution: MonitorIncidentResolvedEvent['incident']['resolution'],
    state: MonitorIncidentWebhookEvent['monitor']['state'],
    durationSeconds = 3600
): MonitorIncidentResolvedEvent {
    return {
        schemaVersion: 1,
        eventId: randomUUID(),
        eventType: 'monitor.incident.resolved',
        occurredAt: '2026-10-11T12:00:00.000Z',
        monitor: { id: MONITOR_ID, name: MONITOR_NAME, kind: 'tcp', state },
        incident: {
            id: INCIDENT_ID,
            status: 'resolved',
            openedAt: '2026-10-11T11:00:00.000Z',
            resolvedAt: '2026-10-11T12:00:00.000Z',
            resolution,
            durationSeconds
        }
    };
}

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
    const event = hostAlertEvent();
    const body = Buffer.from(JSON.stringify(event));
    function headersFor(rawBody: Buffer = body, timestamp = TIMESTAMP, eventId = event.eventId): IncomingHttpHeaders {
        return {
            'x-oh-my-uptime-event-id': eventId,
            'x-oh-my-uptime-timestamp': String(timestamp),
            'x-oh-my-uptime-signature': `v1=${createHmac('sha256', key).update(`${timestamp}.`).update(rawBody).digest('hex')}`
        };
    }
    function signed(signedEvent: UptimeWebhookEvent) {
        const rawBody = Buffer.from(JSON.stringify(signedEvent));
        return { body: rawBody, headers: headersFor(rawBody, TIMESTAMP, signedEvent.eventId) };
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
    return { sqlite, database, body, headersFor, signed, settings, receiver };
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

test('signed service incident events use the uptime recipients and switches with per-event durable receipts', async t => {
    const f = fixture(t);
    f.settings.webhook.notifyGroups = [101, 101, 202, 303];
    f.settings.webhook.notifyUsers = [404, 404];
    f.settings.enabledGroupIds = [101, 202];
    await setModuleEnabled(202, 'uptime-webhook', false, f.database);
    const deliveries: { recipient: string; message: string }[] = [];
    const senders: Pick<UptimeWebhookReceiverOptions, 'sendGroup' | 'sendPrivate'> = {
        sendGroup: async (id, message) => {
            deliveries.push({ recipient: `group:${id}`, message });
            return { message_id: deliveries.length };
        },
        sendPrivate: async (id, message) => {
            deliveries.push({ recipient: `private:${id}`, message });
            return { message_id: deliveries.length };
        }
    };
    const receiver = f.receiver(senders);
    const opened = serviceOpenedEvent();
    const resolved = serviceResolvedEvent('recovered', 'up');
    for (const event of [opened, resolved]) {
        const request = f.signed(event);
        const before = deliveries.length;
        await receiver.receive(request.body, request.headers);
        await receiver.receive(request.body, request.headers);
        const sent = deliveries.slice(before);
        assert.deepEqual(sent.map(delivery => delivery.recipient).sort(), ['group:101', 'private:404']);
        assert.equal(new Set(sent.map(delivery => delivery.message)).size, 1);
        assert.ok(sent[0].message.includes(MONITOR_NAME));
        assert.ok(sent[0].message.includes(event.incident.openedAt));
    }
    assert.notEqual(deliveries[0].message, deliveries[2].message);
    assert.ok(deliveries[2].message.includes(resolved.incident.resolvedAt));
    const receipts = f.database.select().from(schema.uptimeWebhookReceipts).all();
    assert.deepEqual(
        receipts.map(receipt => `${receipt.eventId}:${receipt.recipientType}:${receipt.recipientId}`).sort(),
        [
            `${opened.eventId}:group:101`,
            `${opened.eventId}:private:404`,
            `${resolved.eventId}:group:101`,
            `${resolved.eventId}:private:404`
        ].sort()
    );

    const restarted = f.receiver(senders);
    for (const event of [opened, resolved]) {
        const request = f.signed(event);
        await restarted.receive(request.body, request.headers);
    }
    assert.equal(deliveries.length, 4);
    assert.equal(f.database.select().from(schema.uptimeWebhookReceipts).all().length, 4);
});

test('service incident bodies with mismatched lifecycle or private fields never reach QQ or receipts', async t => {
    const f = fixture(t);
    f.settings.webhook.notifyUsers = [404];
    let sends = 0;
    const send = async () => {
        sends++;
        return { message_id: sends };
    };
    const receiver = f.receiver({ sendGroup: send, sendPrivate: send });
    const opened = serviceOpenedEvent();
    const resolved = { ...serviceResolvedEvent('recovered', 'up'), eventId: opened.eventId };
    const invalidBodies: unknown[] = [
        { ...opened, incident: { ...opened.incident, status: 'resolved' } },
        { ...opened, incident: { ...opened.incident, resolution: 'recovered' } },
        { ...opened, incident: { ...opened.incident, resolvedAt: opened.occurredAt } },
        { ...resolved, eventType: 'monitor.incident.opened' },
        { ...resolved, incident: { ...resolved.incident, status: 'ongoing' } },
        { ...resolved, incident: { ...resolved.incident, resolution: null } },
        { ...resolved, incident: { ...resolved.incident, resolution: 'policy_changed' } },
        { ...resolved, incident: { ...resolved.incident, resolvedAt: null } },
        { ...opened, alert: hostAlertEvent().alert },
        { ...opened, monitor: { ...opened.monitor, url: 'https://10.0.0.5/admin' } },
        { ...opened, monitor: { ...opened.monitor, headers: { authorization: 'Bearer secret' } } },
        { ...opened, incident: { ...opened.incident, errorMessage: 'connect ECONNREFUSED 10.0.0.5:443' } }
    ];
    for (const event of invalidBodies) {
        const rawBody = Buffer.from(JSON.stringify(event));
        await assert.rejects(receiver.receive(rawBody, f.headersFor(rawBody, TIMESTAMP, opened.eventId)), {
            statusCode: 400
        });
    }
    const request = f.signed(opened);
    await assert.rejects(
        receiver.receive(request.body, { ...request.headers, 'x-oh-my-uptime-event-id': randomUUID() }),
        { statusCode: 400 }
    );
    assert.equal(sends, 0);
    assert.equal(f.database.select().from(schema.uptimeWebhookReceipts).all().length, 0);
});

test('service incident partial failure retries only missing recipients and each lifecycle event delivers once', async t => {
    const f = fixture(t);
    f.settings.webhook.notifyGroups = [101, 202];
    f.settings.webhook.notifyUsers = [303];
    const attempts: { id: number; message: string }[] = [];
    let failing = true;
    const send = async (id: number, message: string) => {
        attempts.push({ id, message });
        if (id === 202 && failing) throw new Error('simulated QQ failure');
        return { message_id: attempts.length };
    };
    const opened = f.signed(serviceOpenedEvent('down'));
    const first = f.receiver({ sendGroup: send, sendPrivate: send });
    await assert.rejects(
        Promise.all([first.receive(opened.body, opened.headers), first.receive(opened.body, opened.headers)]),
        { statusCode: 503 }
    );
    assert.deepEqual(attempts.map(attempt => attempt.id).sort(), [101, 202, 303]);
    assert.equal(f.database.select().from(schema.uptimeWebhookReceipts).all().length, 2);

    failing = false;
    const recreated = f.receiver({ sendGroup: send, sendPrivate: send });
    await recreated.receive(opened.body, opened.headers);
    await recreated.receive(opened.body, opened.headers);
    assert.deepEqual(attempts.map(attempt => attempt.id).sort(), [101, 202, 202, 303]);
    assert.equal(new Set(attempts.map(attempt => attempt.message)).size, 1);
    assert.equal(f.database.select().from(schema.uptimeWebhookReceipts).all().length, 3);

    const resolved = f.signed(serviceResolvedEvent('recovered', 'up'));
    await Promise.all([
        recreated.receive(resolved.body, resolved.headers),
        recreated.receive(resolved.body, resolved.headers)
    ]);
    await recreated.receive(resolved.body, resolved.headers);
    assert.deepEqual(
        attempts
            .slice(4)
            .map(attempt => attempt.id)
            .sort(),
        [101, 202, 303]
    );
    assert.equal(new Set(attempts.map(attempt => attempt.message)).size, 2);
    assert.equal(f.database.select().from(schema.uptimeWebhookReceipts).all().length, 6);
});

test('service notifications reflect state and closure kind without identifiers or unproven recovery', async t => {
    const f = fixture(t);
    const messages: string[] = [];
    const receiver = f.receiver({
        sendGroup: async (_id, message) => {
            messages.push(message);
            return { message_id: messages.length };
        },
        sendPrivate: async () => {
            throw new Error('unexpected private send');
        }
    });
    const render = async (event: MonitorIncidentWebhookEvent) => {
        const request = f.signed(event);
        await receiver.receive(request.body, request.headers);
        const message = messages.pop();
        assert.ok(message);
        assert.ok(message.includes(MONITOR_NAME));
        for (const identifier of [MONITOR_ID, INCIDENT_ID, event.eventId]) assert.ok(!message.includes(identifier));
        return message;
    };

    assert.notEqual(await render(serviceOpenedEvent('degraded')), await render(serviceOpenedEvent('down')));
    const confirmedRecovery = await render(serviceResolvedEvent('recovered', 'up'));
    assert.notEqual(confirmedRecovery, await render(serviceResolvedEvent('recovered', 'up', 3661)));
    const unconfirmed: string[] = [];
    for (const state of ['degraded', 'down', 'unknown', 'pending'] as const) {
        unconfirmed.push(await render(serviceResolvedEvent('recovered', state)));
    }
    const administrative: string[] = [];
    for (const resolution of ['monitor_disabled', 'probe_assignment_changed'] as const) {
        const closedWhileUp = await render(serviceResolvedEvent(resolution, 'up'));
        assert.equal(closedWhileUp, await render(serviceResolvedEvent(resolution, 'down')));
        administrative.push(closedWhileUp);
    }
    assert.notEqual(administrative[0], administrative[1]);
    // Lines present only in the confirmed-up recovery are its recovery claims; no other closure may repeat them.
    const recoveryClaims = confirmedRecovery.split('\n').filter(line => !unconfirmed[0].split('\n').includes(line));
    assert.ok(recoveryClaims.length > 0);
    for (const message of [...unconfirmed, ...administrative]) {
        const lines = message.split('\n');
        assert.ok(recoveryClaims.every(claim => !lines.includes(claim)));
    }
});
