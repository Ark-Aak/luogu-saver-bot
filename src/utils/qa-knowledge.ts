import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { qaKnowledgeItems } from '@/db/schema';

export type QaKnowledgeItem = {
    id: number;
    title: string;
    content: string;
};

export function getQaKnowledgeItems(limit?: number): Promise<QaKnowledgeItem[]> {
    return db.query.qaKnowledgeItems.findMany({
        columns: {
            id: true,
            title: true,
            content: true
        },
        orderBy: asc(qaKnowledgeItems.id),
        limit
    });
}

export function getQaKnowledgeItemById(id: number): Promise<QaKnowledgeItem | undefined> {
    return db.query.qaKnowledgeItems.findFirst({
        columns: {
            id: true,
            title: true,
            content: true
        },
        where: eq(qaKnowledgeItems.id, id)
    });
}

export async function addQaKnowledgeItem(title: string, content: string, createdBy: number): Promise<number> {
    const now = Date.now();
    const result = await db
        .insert(qaKnowledgeItems)
        .values({
            title,
            content,
            createdBy,
            createdAt: now,
            updatedAt: now
        })
        .returning({ id: qaKnowledgeItems.id });

    return result[0].id;
}

export async function updateQaKnowledgeItem(id: number, title: string, content: string): Promise<boolean> {
    const result = await db
        .update(qaKnowledgeItems)
        .set({
            title,
            content,
            updatedAt: Date.now()
        })
        .where(eq(qaKnowledgeItems.id, id))
        .returning({ id: qaKnowledgeItems.id });

    return result.length > 0;
}

export async function deleteQaKnowledgeItem(id: number): Promise<boolean> {
    const result = await db
        .delete(qaKnowledgeItems)
        .where(eq(qaKnowledgeItems.id, id))
        .returning({ id: qaKnowledgeItems.id });
    return result.length > 0;
}
