import { Command, CommandScope } from '@/types';
import { OneBotV11 } from '@onebots/protocol-onebot-v11/lib';
import { reply } from '@/utils/client';
import { isAdminByData, isSuperUser } from '@/utils/permission';
import { db } from '@/db';
import { commandBans } from '@/db/schema';
import { and, eq, isNull, or } from 'drizzle-orm';
import { getUserId } from '@/utils/cqcode';
import { isValidUser } from '@/utils/validator';
import { commands } from '@/commands';

export class BanCommandCommand implements Command<OneBotV11.GroupMessageEvent> {
    name = 'ban-command';
    aliases = ['禁止指令'];
    description = '禁止某个用户使用某个指令';
    usage = {
        ban: '/ban-command ban <用户> <指令名> [global] [原因]',
        unban: '/ban-command unban <用户> <指令名> [global]',
        list: '/ban-command list [用户]'
    };
    scope: CommandScope = 'group';

    validateArgs(args: string[]): boolean {
        if (args.length === 0) return false;
        const action = args[0];

        if (action === 'ban') {
            return args.length >= 3 && isValidUser(args[1]);
        } else if (action === 'unban') {
            return args.length >= 3 && isValidUser(args[1]);
        } else if (action === 'list') {
            return args.length === 1 || (args.length === 2 && isValidUser(args[1]));
        }

        return false;
    }

    async execute(args: string[], client: any, data: OneBotV11.GroupMessageEvent): Promise<void> {
        const action = args[0];

        if (!isSuperUser(data.user_id) && !(await isAdminByData(client, data))) {
            await reply(client, data, '权限不足，需要管理员或超级管理员权限。');
            return;
        }

        if (action === 'ban') {
            await this.handleBan(args, client, data);
        } else if (action === 'unban') {
            await this.handleUnban(args, client, data);
        } else if (action === 'list') {
            await this.handleList(args, client, data);
        }
    }

    private async handleBan(args: string[], client: any, data: OneBotV11.GroupMessageEvent): Promise<void> {
        const userId = getUserId(args[1]);
        if (userId === null) {
            await reply(client, data, '无法解析用户ID。');
            return;
        }

        const commandName = args[2];

        const command = commands.find(cmd => cmd.name === commandName || cmd.aliases?.includes(commandName));
        if (!command) {
            await reply(client, data, `指令 "${commandName}" 不存在。`);
            return;
        }

        const canonicalName = command.name;

        const isGlobal = args[3] === 'global';
        const reasonIndex = isGlobal ? 4 : 3;
        const reason = args.slice(reasonIndex).join(' ') || null;

        if (isGlobal && !isSuperUser(data.user_id)) {
            await reply(client, data, '只有超级管理员可以创建全局禁令。');
            return;
        }

        const scopeType = isGlobal ? 'global' : 'group';
        const scopeId: number | null = isGlobal ? null : data.group_id;

        try {
            await db
                .insert(commandBans)
                .values({
                    userId,
                    commandName: canonicalName,
                    scopeType,
                    scopeId: scopeId as any,
                    bannedBy: data.user_id,
                    bannedAt: Date.now(),
                    reason
                })
                .onConflictDoUpdate({
                    target: [commandBans.userId, commandBans.commandName, commandBans.scopeType, commandBans.scopeId],
                    set: {
                        bannedBy: data.user_id,
                        bannedAt: Date.now(),
                        reason
                    }
                });

            const scopeText = isGlobal ? '全局' : `本群`;
            await reply(
                client,
                data,
                `已禁止用户 ${userId} 在${scopeText}使用指令 "${canonicalName}"。${reason ? `\n原因：${reason}` : ''}`
            );
        } catch (error) {
            await reply(client, data, `操作失败：${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    private async handleUnban(args: string[], client: any, data: OneBotV11.GroupMessageEvent): Promise<void> {
        const userId = getUserId(args[1]);
        if (userId === null) {
            await reply(client, data, '无法解析用户ID。');
            return;
        }

        const commandName = args[2];
        const isGlobal = args[3] === 'global';

        if (isGlobal && !isSuperUser(data.user_id)) {
            await reply(client, data, '只有超级管理员可以解除全局禁令。');
            return;
        }

        const scopeType = isGlobal ? 'global' : 'group';
        const scopeId = isGlobal ? null : data.group_id;

        try {
            const command = commands.find(cmd => cmd.name === commandName || cmd.aliases?.includes(commandName));
            const canonicalName = command?.name || commandName;

            const whereConditions = [
                eq(commandBans.userId, userId),
                eq(commandBans.commandName, canonicalName),
                eq(commandBans.scopeType, scopeType)
            ];

            if (scopeId === null) {
                whereConditions.push(isNull(commandBans.scopeId) as any);
            } else {
                whereConditions.push(eq(commandBans.scopeId, scopeId));
            }

            const result = db
                .delete(commandBans)
                .where(and(...whereConditions))
                .run();

            if (result.changes > 0) {
                const scopeText = isGlobal ? '全局' : `本群`;
                await reply(client, data, `已解除用户 ${userId} 在${scopeText}对指令 "${canonicalName}" 的禁令。`);
            } else {
                await reply(client, data, `未找到相应的禁令记录。`);
            }
        } catch (error) {
            await reply(client, data, `操作失败：${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    private async handleList(args: string[], client: any, data: OneBotV11.GroupMessageEvent): Promise<void> {
        try {
            let bans;

            if (args.length === 2) {
                const userId = getUserId(args[1]);
                if (userId === null) {
                    await reply(client, data, '无法解析用户ID。');
                    return;
                }

                bans = await db.query.commandBans.findMany({
                    where: and(
                        eq(commandBans.userId, userId),
                        or(
                            and(eq(commandBans.scopeType, 'group'), eq(commandBans.scopeId, data.group_id)),
                            eq(commandBans.scopeType, 'global')
                        )
                    )
                });
            } else {
                bans = await db.query.commandBans.findMany({
                    where: or(
                        and(eq(commandBans.scopeType, 'group'), eq(commandBans.scopeId, data.group_id)),
                        isSuperUser(data.user_id) ? eq(commandBans.scopeType, 'global') : undefined
                    )
                });
            }

            if (bans.length === 0) {
                await reply(client, data, '没有找到任何禁令记录。');
                return;
            }

            const banList = bans
                .map((ban, index) => {
                    const scopeText = ban.scopeType === 'global' ? '[全局]' : '[本群]';
                    const reasonText = ban.reason ? `\n  原因：${ban.reason}` : '';
                    const dateText = new Date(ban.bannedAt).toLocaleString();
                    return `${index + 1}. ${scopeText} 用户 ${ban.userId} - 指令 "${ban.commandName}"\n  时间：${dateText}${reasonText}`;
                })
                .join('\n\n');

            await reply(client, data, `指令禁令列表：\n\n${banList}`);
        } catch (error) {
            await reply(client, data, `操作失败：${error instanceof Error ? error.message : '未知错误'}`);
        }
    }
}

