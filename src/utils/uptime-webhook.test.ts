import assert from 'node:assert/strict';
import { createHmac, createSecretKey, randomBytes } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import test from 'node:test';
import { UptimeWebhookEventSchema } from '@/types/uptime-webhook';
import type { HostAlertWebhookEvent, MonitorIncidentWebhookEvent } from '@/types/uptime-webhook';
import { verifyUptimeWebhookRequest } from '@/utils/uptime-webhook';

const NOW = Date.parse('2026-10-11T12:00:00.999Z');
const TIMESTAMP = Math.floor(NOW / 1000);
const key = createSecretKey(randomBytes(32));

function openedEvent(): HostAlertWebhookEvent {
    return {
        schemaVersion: 1,
        eventId: '11111111-1111-4111-8111-111111111111',
        eventType: 'probe.host_alert.opened',
        occurredAt: '2026-10-11T12:00:00.000Z',
        probe: { id: '22222222-2222-4222-8222-222222222222', name: '华北探针', kind: 'remote', mode: 'both' },
        alert: {
            id: '33333333-3333-4333-8333-333333333333',
            kind: 'cpu',
            status: 'open',
            openedAt: '2026-10-11T12:00:00.000Z',
            resolvedAt: null,
            resolution: null,
            value: 95.5,
            valueUnit: 'percent',
            openThreshold: 90,
            resolveThreshold: 75,
            openAfterSeconds: 60,
            resolveAfterSeconds: 120
        }
    };
}

function serviceOpenedEvent(): MonitorIncidentWebhookEvent {
    return {
        schemaVersion: 1,
        eventId: openedEvent().eventId,
        eventType: 'monitor.incident.opened',
        occurredAt: '2026-10-11T11:00:00.000Z',
        monitor: { id: '55555555-5555-4555-8555-555555555555', name: '官网', kind: 'http', state: 'degraded' },
        incident: {
            id: '66666666-6666-4666-8666-666666666666',
            status: 'ongoing',
            openedAt: '2026-10-11T11:00:00.000Z',
            resolvedAt: null,
            resolution: null,
            durationSeconds: 0
        }
    };
}

function headersFor(rawBody: Buffer, timestamp = TIMESTAMP): IncomingHttpHeaders {
    return {
        'x-oh-my-uptime-event-id': openedEvent().eventId,
        'x-oh-my-uptime-timestamp': String(timestamp),
        'x-oh-my-uptime-signature': `v1=${createHmac('sha256', key).update(`${timestamp}.`, 'utf8').update(rawBody).digest('hex')}`
    };
}

test('version 1 HMAC authenticates the exact UTF-8 bytes, not parsed or normalized JSON', () => {
    const event = openedEvent();
    const rawBody = Buffer.from(`\n${JSON.stringify(event, null, 2)}\n`, 'utf8');
    const headers = headersFor(rawBody);
    assert.deepEqual(verifyUptimeWebhookRequest(rawBody, headers, () => key, NOW), event);

    const normalizedBody = Buffer.from(JSON.stringify(event), 'utf8');
    assert.throws(() => verifyUptimeWebhookRequest(normalizedBody, headers, () => key, NOW), { statusCode: 401 });
    const tampered = Buffer.from(rawBody);
    tampered[tampered.length - 1] = 32;
    assert.throws(() => verifyUptimeWebhookRequest(tampered, headers, () => key, NOW), { statusCode: 401 });
    assert.throws(() => verifyUptimeWebhookRequest(rawBody, headers, () => createSecretKey(randomBytes(32)), NOW), {
        statusCode: 401
    });
    assert.throws(
        () =>
            verifyUptimeWebhookRequest(
                rawBody,
                {
                    ...headers,
                    'x-oh-my-uptime-timestamp': String(TIMESTAMP + 1)
                },
                () => key,
                NOW
            ),
        { statusCode: 401 }
    );
});

test('timestamp tolerance includes both five-minute boundaries and excludes the next second', () => {
    const body = Buffer.from(JSON.stringify(openedEvent()));
    for (const delta of [-300, 0, 300]) {
        const verified = verifyUptimeWebhookRequest(body, headersFor(body, TIMESTAMP + delta), () => key, NOW);
        assert.equal(verified.eventId, '11111111-1111-4111-8111-111111111111');
    }
    for (const delta of [-301, 301]) {
        let keyReads = 0;
        assert.throws(
            () =>
                verifyUptimeWebhookRequest(
                    body,
                    headersFor(body, TIMESTAMP + delta),
                    () => {
                        keyReads++;
                        return key;
                    },
                    NOW
                ),
            { statusCode: 401 }
        );
        assert.equal(keyReads, 0);
    }
});

test('malformed and ambiguous authentication headers are rejected before resolving a key', () => {
    const body = Buffer.from(JSON.stringify(openedEvent()));
    const headers = headersFor(body);
    const cases: { headers: IncomingHttpHeaders; statusCode: number }[] = [
        { headers: { ...headers, 'x-oh-my-uptime-timestamp': undefined }, statusCode: 400 },
        { headers: { ...headers, 'x-oh-my-uptime-timestamp': '-1' }, statusCode: 400 },
        { headers: { ...headers, 'x-oh-my-uptime-timestamp': `${TIMESTAMP}.0` }, statusCode: 400 },
        { headers: { ...headers, 'x-oh-my-uptime-timestamp': `0${TIMESTAMP}` }, statusCode: 400 },
        { headers: { ...headers, 'x-oh-my-uptime-timestamp': '9007199254740992' }, statusCode: 400 },
        {
            headers: { ...headers, 'x-oh-my-uptime-timestamp': [String(TIMESTAMP), String(TIMESTAMP)] },
            statusCode: 400
        },
        { headers: { ...headers, 'x-oh-my-uptime-event-id': undefined }, statusCode: 400 },
        { headers: { ...headers, 'x-oh-my-uptime-event-id': [openedEvent().eventId] }, statusCode: 400 },
        { headers: { ...headers, 'x-oh-my-uptime-signature': undefined }, statusCode: 401 },
        { headers: { ...headers, 'x-oh-my-uptime-signature': 'v1=ff' }, statusCode: 401 },
        { headers: { ...headers, 'x-oh-my-uptime-signature': `v2=${'f'.repeat(64)}` }, statusCode: 401 },
        {
            headers: { ...headers, 'x-oh-my-uptime-signature': [String(headers['x-oh-my-uptime-signature'])] },
            statusCode: 401
        },
        {
            headers: {
                ...headers,
                'x-oh-my-uptime-signature': `${headers['x-oh-my-uptime-signature']}, v1=${'f'.repeat(64)}`
            },
            statusCode: 401
        }
    ];
    let keyReads = 0;
    for (const entry of cases) {
        assert.throws(
            () =>
                verifyUptimeWebhookRequest(
                    body,
                    entry.headers,
                    () => {
                        keyReads++;
                        return key;
                    },
                    NOW
                ),
            { statusCode: entry.statusCode }
        );
    }
    assert.equal(keyReads, 0);
});

test('a valid HMAC still requires valid JSON, strict schema version and matching event ID', () => {
    for (const rawBody of [Buffer.from('{'), Buffer.from([0xff])]) {
        assert.throws(() => verifyUptimeWebhookRequest(rawBody, headersFor(rawBody), () => key, NOW), {
            statusCode: 400
        });
    }
    const base = openedEvent();
    const invalidBodies: unknown[] = [
        { ...base, schemaVersion: 2 },
        { ...base, extra: true },
        { ...base, probe: { ...base.probe, secret: 'not part of the public event' } },
        { ...base, eventId: 'not-a-uuid' },
        { ...base, occurredAt: '2026-10-11T12:00:00' },
        { ...base, eventType: 'probe.host_alert.unknown' },
        { ...base, alert: { ...base.alert, status: 'resolved' } },
        { ...base, alert: { ...base.alert, resolvedAt: base.occurredAt } },
        { ...base, alert: { ...base.alert, resolution: 'recovered' } },
        { ...base, alert: { ...base.alert, value: -1 } },
        { ...base, alert: { ...base.alert, resolveAfterSeconds: 0.5 } },
        { ...base, alert: { ...base.alert, openAfterSeconds: Number.MAX_SAFE_INTEGER + 1 } }
    ];
    for (const event of invalidBodies) {
        const rawBody = Buffer.from(JSON.stringify(event));
        assert.throws(() => verifyUptimeWebhookRequest(rawBody, headersFor(rawBody), () => key, NOW), {
            statusCode: 400
        });
    }
    const rawBody = Buffer.from(JSON.stringify(base));
    assert.throws(
        () =>
            verifyUptimeWebhookRequest(
                rawBody,
                {
                    ...headersFor(rawBody),
                    'x-oh-my-uptime-event-id': '44444444-4444-4444-8444-444444444444'
                },
                () => key,
                NOW
            ),
        { statusCode: 400 }
    );
});

test('resolved events require status, time and an official resolution, including administrative closures', () => {
    const base = openedEvent();
    const resolved = {
        ...base,
        eventType: 'probe.host_alert.resolved',
        alert: { ...base.alert, status: 'resolved', resolvedAt: base.occurredAt, resolution: 'recovered' }
    };
    for (const resolution of [
        'recovered',
        'telemetry_resumed',
        'policy_changed',
        'host_monitoring_disabled',
        'probe_revoked'
    ]) {
        const event = {
            ...resolved,
            probe: { ...resolved.probe, mode: 'endpoint' },
            alert: { ...resolved.alert, resolution }
        };
        assert.equal(UptimeWebhookEventSchema.safeParse(event).success, true);
    }
    for (const alert of [
        { ...resolved.alert, status: 'open' },
        { ...resolved.alert, resolvedAt: null },
        { ...resolved.alert, resolution: null },
        { ...resolved.alert, resolution: 'unknown' }
    ]) {
        const rawBody = Buffer.from(JSON.stringify({ ...resolved, alert }));
        assert.throws(() => verifyUptimeWebhookRequest(rawBody, headersFor(rawBody), () => key, NOW), {
            statusCode: 400
        });
    }
});

test('service incident events accept only matching status, resolution and bounded public fields', () => {
    const opened = serviceOpenedEvent();
    const resolved = {
        ...opened,
        eventType: 'monitor.incident.resolved',
        occurredAt: '2026-10-11T20:00:00+08:00',
        incident: {
            ...opened.incident,
            status: 'resolved',
            resolvedAt: '2026-10-11T20:00:00+08:00',
            resolution: 'recovered',
            durationSeconds: 3600
        }
    };
    const verify = (event: unknown) => {
        const rawBody = Buffer.from(JSON.stringify(event));
        return verifyUptimeWebhookRequest(rawBody, headersFor(rawBody), () => key, NOW);
    };
    for (const kind of ['http', 'tcp', 'udp'] as const) {
        for (const state of ['pending', 'up', 'down', 'degraded', 'paused', 'unknown'] as const) {
            const event = { ...opened, monitor: { ...opened.monitor, kind, state } };
            assert.deepEqual(verify(event), event);
        }
    }
    for (const resolution of ['recovered', 'monitor_disabled', 'probe_assignment_changed']) {
        assert.deepEqual(verify({ ...resolved, incident: { ...resolved.incident, resolution } }), {
            ...resolved,
            occurredAt: '2026-10-11T12:00:00.000Z',
            incident: { ...resolved.incident, resolvedAt: '2026-10-11T12:00:00.000Z', resolution }
        });
    }

    const invalidBodies: unknown[] = [
        { ...opened, incident: { ...opened.incident, status: 'resolved' } },
        { ...opened, incident: { ...opened.incident, resolvedAt: opened.occurredAt } },
        { ...opened, incident: { ...opened.incident, resolution: 'recovered' } },
        { ...resolved, eventType: 'monitor.incident.opened' },
        { ...resolved, incident: { ...resolved.incident, status: 'ongoing' } },
        { ...resolved, incident: { ...resolved.incident, resolvedAt: null } },
        { ...resolved, incident: { ...resolved.incident, resolution: null } },
        { ...resolved, incident: { ...resolved.incident, resolution: 'telemetry_resumed' } },
        { ...resolved, incident: { ...resolved.incident, resolvedAt: '2026-10-11T12:00:00' } },
        { ...opened, eventType: 'probe.host_alert.opened' },
        { ...opened, eventType: 'monitor.incident.unknown' },
        { ...opened, probe: openedEvent().probe },
        { ...openedEvent(), eventType: 'monitor.incident.opened' },
        { ...opened, monitor: { ...opened.monitor, kind: 'dns' } },
        { ...opened, monitor: { ...opened.monitor, state: 'operational' } },
        { ...opened, monitor: { ...opened.monitor, id: 'not-a-uuid' } },
        { ...opened, incident: { ...opened.incident, id: 'not-a-uuid' } },
        { ...opened, incident: { ...opened.incident, durationSeconds: -1 } },
        { ...opened, incident: { ...opened.incident, durationSeconds: 0.5 } },
        { ...opened, incident: { ...opened.incident, durationSeconds: Number.MAX_SAFE_INTEGER + 1 } },
        { ...opened, target: 'https://10.0.0.5/admin' },
        { ...opened, monitor: { ...opened.monitor, url: 'https://10.0.0.5/admin' } },
        { ...opened, monitor: { ...opened.monitor, headers: { authorization: 'Bearer secret' } } },
        { ...opened, incident: { ...opened.incident, errorMessage: 'connect ECONNREFUSED 10.0.0.5:443' } }
    ];
    for (const event of invalidBodies) {
        assert.throws(() => verify(event), { statusCode: 400 });
    }
});
