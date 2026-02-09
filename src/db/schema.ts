import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('binds', {
    id: integer('id').primaryKey(),
    email: text('email').notNull(),
    lId: integer('lid').notNull(),
});

export const caves = sqliteTable('caves', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    senderName: text('sender_name').notNull(),
    senderId: integer('sender_id').notNull(),
    groupId: integer('group_id').notNull(),
    rawText: text('raw_text').notNull(),
});