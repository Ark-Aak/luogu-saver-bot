import { Command, CommandScope, resolveCommandUsage } from '.';
import { NapLink } from '@naplink/naplink';
import { OneBotV11 } from '@onebots/protocol-onebot-v11/lib';
import { MessageBuilder } from '@/utils/message-builder';
import { db } from '@/db';
import { commandAliases } from '@/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { isSuperUser, isAdminOrSuperUser } from '@/utils/permission';
import { getTargetId, sendAutoMessage } from '@/utils/client';

export class AliasCommand implements Command<OneBotV11.GroupMessageEvent | OneBotV11.PrivateMessageEvent> {
    name = 'alias';
    aliases = ['a'];
    description = '管理命令别名。';
    usage = {
        set: '/alias set <别名> <目标指令> [参数模板]',
        del: '/alias del <别名>',
        list: '/alias list',
        setglobal: '/alias setglobal <别名> <目标指令> [参数模板]',
    };
    scope: CommandScope = 'both';

    private readonly MAX_ALIAS_NAME_LENGTH = 50;
    private readonly MAX_ARG_TEMPLATE_LENGTH = 500;
    private readonly ALIAS_NAME_PATTERN = /^[a-zA-Z0-9_\u4e00-\u9fa5-]+$/;

    private isRegexTemplate(template: string): boolean {
        const trimmed = template.trim();
        // Use restrictive character class to prevent ReDoS: no slashes, newlines, or carriage returns
        const match = trimmed.match(/^s\/([^\/\n\r]+)\/([^\/\n\r]+)(\/[dgimsuvy]*)?$/);
        if (!match) {
            return false;
        }
        // Ensure search and replace parts are non-empty after trimming
        return match[1].trim().length > 0 && match[2].trim().length > 0;
    }

    private validateAliasName(name: string): { valid: boolean; error?: string } {
        if (!name || name.length === 0) {
            return { valid: false, error: '别名不能为空。' };
        }
        if (name.length > this.MAX_ALIAS_NAME_LENGTH) {
            return { valid: false, error: `别名长度不能超过 ${this.MAX_ALIAS_NAME_LENGTH} 个字符。` };
        }
        if (!this.ALIAS_NAME_PATTERN.test(name)) {
            return { valid: false, error: '别名只能包含字母、数字、下划线、中文和连字符。' };
        }
        return { valid: true };
    }

    private validateArgTemplate(template: string | null, userIsSuperUser: boolean): { valid: boolean; error?: string } {
        if (!template) {
            return { valid: true };
        }
        if (template.length > this.MAX_ARG_TEMPLATE_LENGTH) {
            return { valid: false, error: `参数模板长度不能超过 ${this.MAX_ARG_TEMPLATE_LENGTH} 个字符。` };
        }
        if (this.isRegexTemplate(template) && !userIsSuperUser) {
            return { valid: false, error: '只有超级管理员可以使用正则表达式模板 (s/.../...)。' };
        }
        return { valid: true };
    }

    async validateArgs(args: string[], client: NapLink, data: OneBotV11.GroupMessageEvent | OneBotV11.PrivateMessageEvent): Promise<boolean | 'replied'> {
        const isPrivate = data.message_type === 'private';
        const usage = resolveCommandUsage(this, args[0]);
        const sendUsage = async (text: string) => {
            const msg = new MessageBuilder()
                .reply(data.message_id)
                .atIf(!isPrivate, data.user_id)
                .text(`${text}\n用法：\n${usage}`)
                .build();
            await sendAutoMessage(client, isPrivate, getTargetId(data), msg);
        };

        if (args.length === 0) {
            await sendUsage('参数不足。');
            return 'replied';
        }
        const action = args[0];
        if (!['set', 'setglobal', 'del', 'list'].includes(action)) {
            await sendUsage('未知操作。');
            return 'replied';
        }
        if (action === 'list' && args.length !== 1) {
            await sendUsage('list 不接受额外参数。');
            return 'replied';
        }
        if (action === 'del' && args.length !== 2) {
            await sendUsage('del 需要且仅需要 1 个参数。');
            return 'replied';
        }
        if ((action === 'set' || action === 'setglobal') && args.length < 3) {
            await sendUsage(`${action} 需要至少 2 个参数。`);
            return 'replied';
        }
        return true;
    }

    async execute(args: string[], client: NapLink, data: OneBotV11.GroupMessageEvent | OneBotV11.PrivateMessageEvent): Promise<void> {
        const isPrivate = data.message_type === 'private';
        const reply = async (text: string) => {
            const msg = new MessageBuilder()
                .reply(data.message_id)
                .atIf(!isPrivate, data.user_id)
                .text(text)
                .build();
            await sendAutoMessage(client, isPrivate, getTargetId(data), msg);
        };

        const action = args[0];
        const scopeType = isPrivate ? 'private' : 'group';
        const scopeId = isPrivate ? data.user_id : data.group_id;

        if (action === 'list') {
            const aliases = await db.query.commandAliases.findMany({
                where: (alias, { or, and, eq }) => or(
                    and(eq(alias.scopeType, scopeType), eq(alias.scopeId, scopeId)),
                    and(eq(alias.scopeType, 'global'), eq(alias.scopeId, 0))
                )
            });
            if (aliases.length === 0) {
                await reply('当前没有可用别名。');
                return;
            }
            await reply(`当前别名:\n${aliases.map(a => `${a.alias} -> ${a.targetCommand}${a.argTemplate ? ` (${a.argTemplate})` : ''}`).join('\n')}`);
            return;
        }

        if (action === 'del') {
            const aliasName = args[1];
            if (!aliasName) {
                await reply('请提供要删除的别名。');
                return;
            }
            await db.delete(commandAliases).where(and(eq(commandAliases.alias, aliasName), eq(commandAliases.scopeType, scopeType), eq(commandAliases.scopeId, scopeId)));
            await reply(`已删除别名 ${aliasName}。`);
            return;
        }

        if (action === 'set' || action === 'setglobal') {
            const aliasName = args[1];
            const target = args[2];
            const argTemplate = args.slice(3).join(' ') || null;
            if (!aliasName || !target) {
                await reply('请提供别名和目标指令。');
                return;
            }

            // Validate alias name
            const aliasNameValidation = this.validateAliasName(aliasName);
            if (!aliasNameValidation.valid) {
                await reply(aliasNameValidation.error!);
                return;
            }

            const isGlobal = action === 'setglobal';
            const userIsSuperUser = isSuperUser(data.user_id);
            
            if (isGlobal && !userIsSuperUser) {
                await reply('只有超级管理员可以设置全局别名。');
                return;
            }

            // Check permission for regular set command in groups
            if (!isGlobal && data.message_type === 'group') {
                const hasPermission = await isAdminOrSuperUser(client, data.user_id, data.group_id);
                
                if (!hasPermission) {
                    await reply('只有管理员、群主或超级管理员可以设置群组别名。');
                    return;
                }
            }

            // Validate arg template
            const argTemplateValidation = this.validateArgTemplate(argTemplate, userIsSuperUser);
            if (!argTemplateValidation.valid) {
                await reply(argTemplateValidation.error!);
                return;
            }

            const actualScopeType = isGlobal ? 'global' : scopeType;
            const actualScopeId = isGlobal ? 0 : scopeId;

            const existing = await db.query.commandAliases.findFirst({
                where: (alias, { and, eq }) => and(
                    eq(alias.alias, aliasName),
                    eq(alias.scopeType, actualScopeType),
                    eq(alias.scopeId, actualScopeId)
                )
            });

            if (existing) {
                await db.update(commandAliases).set({
                    targetCommand: target,
                    argTemplate,
                }).where(eq(commandAliases.id, existing.id));
            }
            else {
                await db.insert(commandAliases).values({
                    alias: aliasName,
                    targetCommand: target,
                    argTemplate,
                    scopeType: actualScopeType,
                    scopeId: actualScopeId,
                });
            }
            await reply(`别名 ${aliasName} 已设置为 ${target}${argTemplate ? ` ${argTemplate}` : ''}。`);
            return;
        }

        await reply('未知操作。');
    }
}
