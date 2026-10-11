import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { groupModuleToggles } from '@/db/schema';

export const GROUP_FEATURE_MODULES = [
    'anti-spam',
    'image-moderation',
    'group-auto-review',
    'github-webhook',
    'uptime-webhook',
    'message-embedding'
] as const;

/**
 * 查询某群某模块是否启用。
 * 表中无记录视为默认开启。
 */
export async function isModuleEnabled(groupId: number, moduleName: string, database: typeof db = db): Promise<boolean> {
    const row = await database.query.groupModuleToggles.findFirst({
        where: and(eq(groupModuleToggles.groupId, groupId), eq(groupModuleToggles.moduleName, moduleName))
    });
    return row?.enabled ?? true;
}

/**
 * 设置某群某模块的启用状态。
 */
export async function setModuleEnabled(
    groupId: number,
    moduleName: string,
    enabled: boolean,
    database: typeof db = db
): Promise<void> {
    const updatedAt = Date.now();
    await database
        .insert(groupModuleToggles)
        .values({
            groupId,
            moduleName,
            enabled,
            updatedAt
        })
        .onConflictDoUpdate({
            target: [groupModuleToggles.groupId, groupModuleToggles.moduleName],
            set: {
                enabled,
                updatedAt
            }
        });
}
