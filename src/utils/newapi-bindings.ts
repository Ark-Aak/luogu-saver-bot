import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { newApiBindings } from '@/db/schema';

export function getNewApiBindingByUserId(userId: number) {
    return db.query.newApiBindings.findFirst({
        where: eq(newApiBindings.userId, userId)
    });
}

export async function upsertNewApiBinding(userId: number, newApiUserId: number): Promise<void> {
    await db
        .insert(newApiBindings)
        .values({
            userId,
            newApiUserId,
            updatedAt: Date.now()
        })
        .onConflictDoUpdate({
            target: newApiBindings.userId,
            set: {
                newApiUserId,
                updatedAt: Date.now()
            }
        });
}
