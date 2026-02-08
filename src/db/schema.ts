import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('binds', {
    id: integer('id').primaryKey(),
    email: text('email').notNull(),
    lId: integer('lid').notNull(),
});