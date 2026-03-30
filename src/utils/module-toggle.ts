import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { groupModuleToggles } from '@/db/schema';

/**
 * 查询某群某模块是否启用。
 * 表中无记录视为默认开启。
 */
export async function isModuleEnabled(groupId: number, moduleName: string): Promise<boolean> {
    const row = await db.query.groupModuleToggles.findFirst({
        where: and(eq(groupModuleToggles.groupId, groupId), eq(groupModuleToggles.moduleName, moduleName))
    });
    return row?.enabled ?? true;
}

/**
 * 设置某群某模块的启用状态。
 */
export async function setModuleEnabled(groupId: number, moduleName: string, enabled: boolean): Promise<void> {
    await db
        .insert(groupModuleToggles)
        .values({
            groupId,
            moduleName,
            enabled,
            updatedAt: Date.now()
        })
        .onConflictDoUpdate({
            target: [groupModuleToggles.groupId, groupModuleToggles.moduleName],
            set: {
                enabled,
                updatedAt: Date.now()
            }
        });
}

/**
 * 列出某群所有已关闭的模块名。
 */
export async function listDisabledModules(groupId: number): Promise<string[]> {
    const rows = await db.query.groupModuleToggles.findMany({
        where: and(eq(groupModuleToggles.groupId, groupId), eq(groupModuleToggles.enabled, false))
    });
    return rows.map(r => r.moduleName);
}
