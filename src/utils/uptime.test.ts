import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { RequestListener } from 'node:http';
import test from 'node:test';
import type { TestContext } from 'node:test';
import { formatUptimeResponse, PublicUptimeStatusSchema, queryUptimeStatus } from '@/utils/uptime';
import type { UptimeQueryOptions } from '@/utils/uptime';

const publicPage = {
    productName: 'Uptime',
    title: '服务状态',
    generatedAt: '2026-10-11T12:34:56+08:00',
    overallStatus: 'operational',
    monitors: [
        {
            name: 'API Gateway',
            status: 'operational',
            uptime: { '24h': 99.875, '7d': null, '30d': 100 }
        }
    ]
};

async function serve(t: TestContext, handler: RequestListener): Promise<string> {
    const server = createServer(handler);
    await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            server.off('error', reject);
            resolve();
        });
    });
    t.after(async () => {
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
    });
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    return `http://127.0.0.1:${address.port}`;
}

test('public projection keeps paused, pending, unknown and null distinct from outages and zero uptime', () => {
    const states = ['operational', 'degraded', 'outage', 'paused', 'pending', 'unknown'] as const;
    const page = PublicUptimeStatusSchema.parse({
        ...publicPage,
        overallStatus: 'degraded',
        topology: 'private-topology',
        incidents: [{ id: 'private-incident-id' }],
        monitors: states.map(status => ({
            name: status,
            status,
            uptime: { '24h': status === 'outage' ? 0 : null, '7d': null, '30d': null },
            target: 'http://private-target/admin',
            hostId: 'private-host-id',
            probeId: 'private-probe-id',
            checkId: 'private-check-id'
        }))
    });
    assert.deepEqual(Object.keys(page).sort(), ['generatedAt', 'monitors', 'overallStatus', 'productName', 'title']);
    assert.deepEqual(Object.keys(page.monitors[0]).sort(), ['name', 'status', 'uptime']);
    assert.equal(page.generatedAt, '2026-10-11T04:34:56.000Z');
    assert.deepEqual(
        page.monitors.map(monitor => monitor.status),
        states
    );
    assert.equal(page.monitors[2].uptime['24h'], 0);
    assert.equal(page.monitors[3].uptime['24h'], null);

    const text = formatUptimeResponse({
        ok: true,
        page,
        monitors: page.monitors,
        serviceName: '',
        publicPageUrl: 'https://status.example/status/main'
    });
    assert.doesNotMatch(text, /private-|topology|hostId|probeId|checkId/);
});

test('service filtering uses public names in page order without accepting URLs or changing the configured endpoint', async t => {
    const requests: { url: string | undefined; method: string | undefined; authorization: string | undefined }[] = [];
    const origin = await serve(t, (request, response) => {
        requests.push({ url: request.url, method: request.method, authorization: request.headers.authorization });
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
            JSON.stringify({
                ...publicPage,
                monitors: [
                    ...publicPage.monitors,
                    { ...publicPage.monitors[0], name: 'Gateway API Replica', status: 'pending' },
                    { ...publicPage.monitors[0], name: 'Database' }
                ]
            })
        );
    });

    const options: UptimeQueryOptions = {
        baseUrl: `${origin}/`,
        statusPageSlug: 'public-page',
        requestTimeoutMs: 1_000
    };
    const selected = await queryUptimeStatus(options, '  aPi  ');
    assert.equal(selected.ok, true);
    if (!selected.ok) return;
    assert.deepEqual(
        selected.monitors.map(monitor => monitor.name),
        ['API Gateway', 'Gateway API Replica']
    );
    assert.equal(selected.page.overallStatus, 'operational');
    assert.equal(selected.publicPageUrl, `${origin}/status/public-page`);

    const joinedName = await queryUptimeStatus(options, ['API', 'Gateway'].join(' '));
    assert.equal(joinedName.ok, true);
    if (joinedName.ok)
        assert.deepEqual(
            joinedName.monitors.map(monitor => monitor.name),
            ['API Gateway']
        );

    const noMatch = await queryUptimeStatus(options, 'https://other.example/private');
    assert.equal(noMatch.ok, true);
    if (noMatch.ok) assert.equal(noMatch.monitors.length, 0);
    assert.doesNotMatch(formatUptimeResponse(noMatch), /other\.example|private/);
    assert.deepEqual(requests.at(-1), {
        url: '/api/v1/public/status-pages/public-page',
        method: 'GET',
        authorization: undefined
    });
});

test('unpublished, unavailable, malformed and schema-invalid responses return actionable errors without source details', async t => {
    const notConfigured = await queryUptimeStatus({ baseUrl: '', statusPageSlug: '', requestTimeoutMs: 1_000 });
    assert.deepEqual(notConfigured, { ok: false, error: 'not-configured' });

    const origin = await serve(t, (request, response) => {
        const slug = request.url?.split('/').at(-1);
        response.setHeader('Content-Type', 'application/json');
        if (slug === 'unpublished' || slug === 'unavailable') {
            response.statusCode = slug === 'unpublished' ? 404 : 503;
            response.end(JSON.stringify({ error: { message: 'private-source /admin/checks/private-id' } }));
            return;
        }
        if (slug === 'malformed') {
            response.end('private-source invalid JSON');
            return;
        }
        const invalidPages: Record<string, unknown> = {
            status: { ...publicPage, overallStatus: 'paused' },
            monitor: { ...publicPage, monitors: [{ ...publicPage.monitors[0], status: 'down' }] },
            missing: { ...publicPage, monitors: [{ ...publicPage.monitors[0], uptime: { '24h': null, '7d': null } }] },
            range: {
                ...publicPage,
                monitors: [{ ...publicPage.monitors[0], uptime: { '24h': 101, '7d': null, '30d': null } }]
            },
            timestamp: { ...publicPage, generatedAt: 'not-a-date' }
        };
        response.end(JSON.stringify(invalidPages[slug ?? '']));
    });

    for (const [slug, expectedError] of [
        ['unpublished', 'not-found'],
        ['unavailable', 'unavailable'],
        ['malformed', 'invalid-response'],
        ['status', 'invalid-response'],
        ['monitor', 'invalid-response'],
        ['missing', 'invalid-response'],
        ['range', 'invalid-response'],
        ['timestamp', 'invalid-response']
    ] as const) {
        const result = await queryUptimeStatus({ baseUrl: origin, statusPageSlug: slug, requestTimeoutMs: 1_000 });
        assert.deepEqual(result, { ok: false, error: expectedError });
        const text = formatUptimeResponse(result);
        assert.doesNotMatch(text, /127\.0\.0\.1|\/api\/|\/admin\/|private-source|private-id|SyntaxError|fetch failed/);
    }
});

test('timeout covers a stalled response body and is distinct from a failed connection', async t => {
    const origin = await serve(t, (request, response) => {
        if (request.url?.endsWith('/reset')) {
            request.socket.destroy();
            return;
        }
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.write('{');
    });
    const timeout = await queryUptimeStatus({ baseUrl: origin, statusPageSlug: 'stall', requestTimeoutMs: 50 });
    assert.deepEqual(timeout, { ok: false, error: 'timeout' });

    const unreachable = await queryUptimeStatus({ baseUrl: origin, statusPageSlug: 'reset', requestTimeoutMs: 1_000 });
    assert.deepEqual(unreachable, { ok: false, error: 'unreachable' });
    assert.doesNotMatch(formatUptimeResponse(unreachable), /127\.0\.0\.1|\/api\/|fetch|socket|ECONN/);
});

test('redirects do not send a second request to another origin', async t => {
    let redirectedRequests = 0;
    const targetOrigin = await serve(t, (_request, response) => {
        redirectedRequests++;
        response.end(JSON.stringify(publicPage));
    });
    const origin = await serve(t, (_request, response) => {
        response.writeHead(302, { Location: `${targetOrigin}/admin/private` });
        response.end();
    });
    const result = await queryUptimeStatus({ baseUrl: origin, statusPageSlug: 'main', requestTimeoutMs: 1_000 });
    assert.deepEqual(result, { ok: false, error: 'invalid-response' });
    assert.equal(redirectedRequests, 0);
    assert.doesNotMatch(formatUptimeResponse(result), /127\.0\.0\.1|\/admin\/|private/);
});
