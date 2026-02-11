import { NapLink } from '@naplink/naplink';
import { db } from '@/db';
import { commandAliases } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { isPrivate, reply } from '@/utils/client';
import { AllMessageEvent, Command, CommandScope } from '@/types';

export class AliasCommand implements Command<AllMessageEvent> {
    name = 'alias';
    aliases = ['a'];
    description = '管理命令别名。';
    usage = {
        set: '/alias set <别名> <目标指令> [参数模板]',
        del: '/alias del <别名>',
        list: '/alias list',
        setglobal: '/alias setglobal <别名> <目标指令> [参数模板]'
    };
    scope: CommandScope = 'both';
    superUserOnly = true;

    validateArgs(args: string[]): boolean {
        if (args.length === 0) {
            return false;
        }
        const action = args[0];
        if (!['set', 'setglobal', 'del', 'list'].includes(action)) {
            return false;
        }
        if (action === 'list' && args.length !== 1) {
            return false;
        }
        if (action === 'del' && args.length !== 2) {
            return false;
        }
        if ((action === 'set' || action === 'setglobal') && args.length < 3) {
            return false;
        }
        return true;
    }

    async execute(args: string[], client: NapLink, data: AllMessageEvent): Promise<void> {
        const action = args[0];
        const scopeType = isPrivate(data) ? 'private' : 'group';
        const scopeId = isPrivate(data) ? data.user_id : data.group_id;

        if (action === 'list') {
            const aliases = await db.query.commandAliases.findMany({
                where: (alias, { or, and, eq, isNull }) =>
                    or(
                        and(eq(alias.scopeType, scopeType), eq(alias.scopeId, scopeId)),
                        and(eq(alias.scopeType, 'global'), isNull(alias.scopeId))
                    )
            });
            if (aliases.length === 0) {
                await reply(client, data, '当前没有可用别名。');
                return;
            }
            await reply(
                client,
                data,
                `当前别名:\n${aliases.map(a => `${a.alias} -> ${a.targetCommand}${a.argTemplate ? ` (${a.argTemplate})` : ''}`).join('\n')}`
            );
            return;
        }

        if (action === 'del') {
            const aliasName = args[1];
            if (!aliasName) {
                await reply(client, data, '请提供要删除的别名。');
                return;
            }
            await db
                .delete(commandAliases)
                .where(
                    and(
                        eq(commandAliases.alias, aliasName),
                        eq(commandAliases.scopeType, scopeType),
                        eq(commandAliases.scopeId, scopeId)
                    )
                );
            await reply(client, data, `已删除别名 ${aliasName}。`);
            return;
        }

        if (action === 'set' || action === 'setglobal') {
            const aliasName = args[1];
            const target = args[2];
            const argTemplate = args.slice(3).join(' ') || null;
            if (!aliasName || !target) {
                await reply(client, data, '请提供别名和目标指令。');
                return;
            }

            const isGlobal = action === 'setglobal';
            const actualScopeType = isGlobal ? 'global' : scopeType;
            const actualScopeId = isGlobal ? null : scopeId;

            const existing = await db.query.commandAliases.findFirst({
                where: (alias, { and, eq, isNull }) =>
                    and(
                        eq(alias.alias, aliasName),
                        eq(alias.scopeType, actualScopeType),
                        actualScopeId === null ? isNull(alias.scopeId) : eq(alias.scopeId, actualScopeId)
                    )
            });

            if (existing) {
                await db
                    .update(commandAliases)
                    .set({
                        targetCommand: target,
                        argTemplate
                    })
                    .where(eq(commandAliases.id, existing.id));
            } else {
                await db.insert(commandAliases).values({
                    alias: aliasName,
                    targetCommand: target,
                    argTemplate,
                    scopeType: actualScopeType,
                    scopeId: actualScopeId
                });
            }
            await reply(client, data, `别名 ${aliasName} 已设置为 ${target}${argTemplate ? ` ${argTemplate}` : ''}。`);
            return;
        }

        await reply(client, data, '未知操作。');
    }
}
