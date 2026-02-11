import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('binds', {
    id: integer('id').primaryKey(),
    email: text('email').notNull(),
    lId: integer('lid').notNull()
});

export const caves = sqliteTable('caves', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    senderName: text('sender_name').notNull(),
    senderId: integer('sender_id').notNull(),
    groupId: integer('group_id').notNull(),
    rawText: text('raw_text').notNull()
});

export const commandAliases = sqliteTable(
    'command_aliases',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        scopeType: text('scope_type').notNull(),
        scopeId: integer('scope_id'),
        alias: text('alias').notNull(),
        targetCommand: text('target_command').notNull(),
        argTemplate: text('arg_template')
    },
    table => ({
        scopeAliasUnique: uniqueIndex('command_alias_scope_alias_unique').on(
            table.scopeType,
            table.scopeId,
            table.alias
        )
    })
);

export const polls = sqliteTable('polls', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    groupId: integer('group_id').notNull(),
    creatorId: integer('creator_id').notNull(),
    title: text('title').notNull(),
    options: text('options').notNull(),
    minLevel: integer('min_level').notNull().default(0),
    isClosed: integer('is_closed', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at').notNull(),
    closedAt: integer('closed_at')
});

export const pollVotes = sqliteTable(
    'poll_votes',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        pollId: integer('poll_id').notNull(),
        groupId: integer('group_id').notNull(),
        userId: integer('user_id').notNull(),
        optionIndex: integer('option_index').notNull(),
        updatedAt: integer('updated_at').notNull()
    },
    table => ({
        pollVoterUnique: uniqueIndex('poll_votes_poll_group_user_unique').on(table.pollId, table.groupId, table.userId)
    })
);

export const gachaPools = sqliteTable('gacha_pools', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    items: text('items').notNull(),
    endAt: integer('end_at').notNull(),
    groupId: integer('group_id').notNull(),
    totalized: integer('totalized', { mode: 'boolean' }).notNull().default(false),
    minLevel: integer('min_level').notNull().default(0)
});

export const gachaRecords = sqliteTable(
    'gacha_records',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        userId: integer('user_id').notNull(),
        poolId: integer('pool_id').notNull(),
        userName: text('user_name').notNull()
    },
    table => ({
        userPoolUnique: uniqueIndex('gacha_records_user_pool_unique').on(table.userId, table.poolId)
    })
);
