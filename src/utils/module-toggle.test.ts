import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@/db/schema';
import { isModuleEnabled, setModuleEnabled } from '@/utils/module-toggle';

test('group module toggles default on and remain isolated by group', async t => {
    const sqlite = new Database(':memory:');
    t.after(() => sqlite.close());
    sqlite.exec(`
        CREATE TABLE group_module_toggles (
            id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
            group_id INTEGER NOT NULL,
            module_name TEXT NOT NULL,
            enabled INTEGER DEFAULT 1 NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE UNIQUE INDEX group_module_toggles_group_module_unique
            ON group_module_toggles (group_id, module_name);
    `);
    const database = drizzle(sqlite, { schema });

    assert.equal(await isModuleEnabled(100, 'anti-spam', database), true);
    await setModuleEnabled(100, 'anti-spam', false, database);
    assert.equal(await isModuleEnabled(100, 'anti-spam', database), false);
    assert.equal(await isModuleEnabled(200, 'anti-spam', database), true);
    await setModuleEnabled(100, 'anti-spam', true, database);
    assert.equal(await isModuleEnabled(100, 'anti-spam', database), true);
});
