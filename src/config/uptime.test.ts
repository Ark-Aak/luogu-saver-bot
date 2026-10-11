import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { UptimeSchema } from './schemas/uptime';

test('status queries accept only a configured HTTP(S) origin and canonical status-page slug', () => {
    for (const baseUrl of [
        'not a URL',
        'ftp://uptime.example.com',
        'https://uptime.example.com/private',
        'https://uptime.example.com/?page=status',
        'https://uptime.example.com/#status',
        'https://reader@uptime.example.com'
    ]) {
        assert.equal(UptimeSchema.safeParse({ baseUrl, statusPageSlug: 'status' }).success, false);
    }
    for (const statusPageSlug of ['../private', 'status?token=value', 'STATUS', '-status', 'x'.repeat(64)]) {
        assert.equal(UptimeSchema.safeParse({ baseUrl: 'https://uptime.example.com', statusPageSlug }).success, false);
    }
    assert.equal(
        UptimeSchema.safeParse({ baseUrl: 'https://uptime.example.com/', statusPageSlug: 'service-status' }).success,
        true
    );
});

test('enabling alert delivery requires a file-backed key and at least one valid QQ recipient', () => {
    const secretFile = resolve('key-for-schema-validation');
    for (const webhook of [
        { enabled: true },
        { enabled: true, secretFile },
        { enabled: true, secretFile: 'relative-key', notifyUsers: [10001] },
        { enabled: true, secretFile, notifyGroups: [0] },
        { enabled: true, secretFile, notifyUsers: [Number.MAX_SAFE_INTEGER + 1] }
    ]) {
        assert.equal(UptimeSchema.safeParse({ webhook }).success, false);
    }
    assert.equal(
        UptimeSchema.safeParse({ webhook: { enabled: true, secretFile, notifyUsers: [10001] } }).success,
        true
    );
});
