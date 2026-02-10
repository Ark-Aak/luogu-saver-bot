import { Command, CommandScope, resolveCommandUsage } from '.';
import { NapLink } from '@naplink/naplink';
import { OneBotV11 } from '@onebots/protocol-onebot-v11/lib';
import { MessageBuilder } from '@/utils/message-builder';
import { reply, sendCommandUsage } from '@/utils/message-format';
import { db } from '@/db';
import { commandAliases } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { isSuperUser } from '@/utils/permission';
import { getTargetId, sendAutoMessage } from '@/utils/client';

export class AliasCommand implements Command<
    OneBotV11.GroupMessageEvent | OneBotV11.PrivateMessageEvent
> {
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

    async execute(
        args: string[],
        client: NapLink,
        data: OneBotV11.GroupMessageEvent | OneBotV11.PrivateMessageEvent
    ): Promise<void> {
        const isPrivate = data.message_type === 'private';
        const action = args[0];
        const scopeType = isPrivate ? 'private' : 'group';
        const scopeId = isPrivate ? data.user_id : data.group_id;

        if (action === 'list') {
            const aliases = await db.query.commandAliases.findMany({
                where: (alias, { or, and, eq, isNull }) =>
                    or(
                        and(eq(alias.scopeType, scopeType), eq(alias.scopeId, scopeId)),
                        and(eq(alias.scopeType, 'global'), isNull(alias.scopeId))
                    )
            });
            if (aliases.length === 0) {
                await reply(client, data, isPrivate, '当前没有可用别名。');
                return;
            }
            await reply(
                client,
                data,
                isPrivate,
                `当前别名:\n${aliases.map(a => `${a.alias} -> ${a.targetCommand}${a.argTemplate ? ` (${a.argTemplate})` : ''}`).join('\n')}`
            );
            return;
        }

        if (action === 'del') {
            const aliasName = args[1];
            if (!aliasName) {
                await reply(client, data, isPrivate, '请提供要删除的别名。');
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
            await reply(client, data, isPrivate, `已删除别名 ${aliasName}。`);
            return;
        }

        if (action === 'set' || action === 'setglobal') {
            const aliasName = args[1];
            const target = args[2];
            const argTemplate = args.slice(3).join(' ') || null;
            if (!aliasName || !target) {
                await reply(client, data, isPrivate, '请提供别名和目标指令。');
                return;
            }

            const isGlobal = action === 'setglobal';
            if (isGlobal && !isSuperUser(data.user_id)) {
                await reply(client, data, isPrivate, '只有超级管理员可以设置全局别名。');
                return;
            }

            const actualScopeType = isGlobal ? 'global' : scopeType;
            const actualScopeId = isGlobal ? null : scopeId;

            const existing = await db.query.commandAliases.findFirst({
                where: (alias, { and, eq, isNull }) =>
                    and(
                        eq(alias.alias, aliasName),
                        eq(alias.scopeType, actualScopeType),
                        actualScopeId === null
                            ? isNull(alias.scopeId)
                            : eq(alias.scopeId, actualScopeId)
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
            await reply(
                client,
                data,
                isPrivate,
                `别名 ${aliasName} 已设置为 ${target}${argTemplate ? ` ${argTemplate}` : ''}。`
            );
            return;
        }

        await reply(client, data, isPrivate, '未知操作。');
    }
}
