import { NapLink } from '@naplink/naplink';
import { commands, resolveCommandUsage } from '@/commands';
import { logger } from '@/utils/logger';
import { config } from '@/config';
import { OneBotV11 } from '@onebots/protocol-onebot-v11/lib';
import { isAdminByData, isSuperUser } from '@/utils/permission';
import { db } from '@/db';
import { and, eq, isNull, or } from 'drizzle-orm';
import { commandAliases, commandBans } from '@/db/schema';
import { reply } from '@/utils/client';
import { AliasScope, AllMessageEvent } from '@/types';
import { isModuleEnabled } from '@/utils/module-toggle';
import { MessageBuilder } from '@/utils/message-builder';
import { MessageSegment } from '@/types/message';
import { registerMessageHandler } from '@/handlers/registry';

const cooldowns = new Map<string, number>();

function isPrivateMessage(data: AllMessageEvent): data is OneBotV11.PrivateMessageEvent {
    return data.message_type === 'private';
}

function resolveStaticCommand(commandName: string) {
    return commands.find(cmd => cmd.name === commandName || cmd.aliases?.includes(commandName));
}

async function resolveCommand(commandName: string, args: string[], aliasScope: AliasScope) {
    const staticCommand = resolveStaticCommand(commandName);
    if (staticCommand) {
        return { command: staticCommand, args };
    }

    const alias =
        (await db.query.commandAliases.findFirst({
            where: (alias, { and, eq }) =>
                and(
                    eq(alias.alias, commandName),
                    eq(alias.scopeType, aliasScope.scopeType),
                    eq(alias.scopeId, aliasScope.scopeId)
                )
        })) ??
        (await db.query.commandAliases.findFirst({
            where: and(
                eq(commandAliases.alias, commandName),
                eq(commandAliases.scopeType, 'global'),
                isNull(commandAliases.scopeId)
            )
        }));
    if (!alias) {
        return { command: null, args };
    }

    const command = resolveStaticCommand(alias.targetCommand);
    if (!command) {
        return { command: null, args };
    }

    if (!alias.argTemplate) {
        return { command, args };
    }

    const joinedArgs = args.join(' ');
    const interpolated = alias.argTemplate
        .replaceAll('{args}', joinedArgs)
        .replace(/\{(\d+)}/g, (_, indexText) => args[Number(indexText) - 1] ?? '')
        .trim();

    return { command, args: interpolated ? interpolated.split(/\s+/) : [] };
}

async function checkCommandBan(
    data: AllMessageEvent,
    commandName: string
): Promise<{ banned: boolean; reason?: string }> {
    if (isSuperUser(data.user_id)) {
        return { banned: false };
    }

    const groupId = isPrivateMessage(data) ? null : data.group_id;

    const ban = await db.query.commandBans.findFirst({
        where: and(
            eq(commandBans.userId, data.user_id),
            eq(commandBans.commandName, commandName),
            or(
                eq(commandBans.scopeType, 'global'),
                groupId !== null ? and(eq(commandBans.scopeType, 'group'), eq(commandBans.scopeId, groupId)) : undefined
            )
        )
    });

    if (ban) {
        return { banned: true, reason: ban.reason ?? undefined };
    }

    return { banned: false };
}

async function checkCooldown(client: NapLink, data: AllMessageEvent, commandName: string, commandCooldown: number) {
    if (isPrivateMessage(data)) {
        if (isSuperUser(data.user_id)) {
            return true;
        }
        const key = `private-${data.user_id}-${commandName}`;
        if (cooldowns.get(key) && Date.now() - cooldowns.get(key)! < commandCooldown) {
            logger.info(`Command ${commandName} is on cooldown in user ${data.user_id}.`);
            return false;
        }
        cooldowns.set(key, Date.now());
        return true;
    }

    if (isSuperUser(data.user_id)) {
        return true;
    }

    if (await isAdminByData(client, data)) {
        return true;
    }

    const key = `group-${data.group_id}-${commandName}`;
    if (cooldowns.get(key) && Date.now() - cooldowns.get(key)! < commandCooldown) {
        logger.info(`Command ${commandName} is on cooldown in group ${data.group_id}.`);
        return false;
    }
    cooldowns.set(key, Date.now());
    return true;
}

function getCooldownRemaining(data: AllMessageEvent, commandName: string, commandCooldown: number) {
    if (isPrivateMessage(data)) {
        const key = `private-${data.user_id}-${commandName}`;
        if (!cooldowns.get(key)) {
            return 0;
        }
        const elapsed = Date.now() - cooldowns.get(key)!;
        return Math.max(0, commandCooldown - elapsed);
    }

    const key = `group-${data.group_id}-${commandName}`;
    if (!cooldowns.get(key)) {
        return 0;
    }
    const elapsed = Date.now() - cooldowns.get(key)!;
    return Math.max(0, commandCooldown - elapsed);
}

function cleanupCooldowns() {
    const now = Date.now();
    for (const [key, timestamp] of cooldowns.entries()) {
        if (now - timestamp > 24 * 60 * 60 * 1000) {
            cooldowns.delete(key);
        }
    }
}
function getMessageSegments(data: AllMessageEvent): MessageSegment[] {
    return data.message?.length
        ? (data.message as MessageSegment[])
        : new MessageBuilder().cqCode(data.raw_message).build();
}

function extractReplyMessageId(segments: MessageSegment[]): number | undefined {
    const firstSegment = segments[0];
    if (!firstSegment || firstSegment.type !== 'reply') {
        return undefined;
    }

    const id = Number(firstSegment.data.id);
    return Number.isInteger(id) && id > 0 ? id : undefined;
}

function getCommandSegments(data: AllMessageEvent, segments: MessageSegment[]): MessageSegment[] {
    let startIndex = segments[0]?.type === 'reply' ? 1 : 0;
    const firstCommandSegment = segments[startIndex];
    if (
        firstCommandSegment?.type === 'at' &&
        String((firstCommandSegment.data as { qq?: string | number }).qq) === String(data.self_id)
    ) {
        startIndex += 1;
    }

    return segments.slice(startIndex);
}

function getCommandRawMessage(segments: MessageSegment[]): string {
    return new MessageBuilder().segment(segments).buildCqCode().trimStart();
}

async function handleMessage(client: NapLink, data: AllMessageEvent) {
    const segments = getMessageSegments(data);
    const replyMessageId = extractReplyMessageId(segments);
    const rawMessage = getCommandRawMessage(getCommandSegments(data, segments));

    if (!rawMessage.startsWith(config.command.prefix)) {
        return;
    }

    const rawBody = rawMessage.slice(config.command.prefix.length).trim();
    const [commandName, ...args] = rawBody.split(/\s+/);
    const { command, args: resolvedArgs } = await resolveCommand(commandName, args, {
        scopeType: isPrivateMessage(data) ? 'private' : 'group',
        scopeId: isPrivateMessage(data) ? data.user_id : data.group_id
    });

    if (!command) {
        logger.warn(`Unknown command: ${commandName}`);
        return;
    }

    if (isPrivateMessage(data) && command.scope === 'group') {
        logger.warn(`Command ${commandName} is group-only and cannot be used in private chats.`);
        return;
    }
    if (!isPrivateMessage(data) && command.scope === 'private') {
        logger.warn(`Command ${commandName} is private-only and cannot be used in group chats.`);
        return;
    }

    if (!isPrivateMessage(data) && !(await isModuleEnabled(data.group_id, command.name))) {
        logger.info(`Command ${command.name} is disabled in group ${data.group_id}.`);
        return;
    }

    if (command.superUserOnly && !isSuperUser(data.user_id)) {
        logger.warn(
            `Command ${commandName} requires super user permission, but user ${data.user_id} is not a super user.`
        );
        await reply(client, data, '权限不足，该命令仅限超级管理员使用。');
        return;
    }

    const banCheck = await checkCommandBan(data, command.name);
    if (banCheck.banned) {
        logger.warn(`User ${data.user_id} is banned from using command ${command.name}`);
        await reply(
            client,
            data,
            `你已被禁止使用指令 "${command.name}"。${banCheck.reason ? `\n原因：${banCheck.reason}` : ''}`
        );
        return;
    }

    if (!(await checkCooldown(client, data, command.name, command.cooldown || 0))) {
        await reply(
            client,
            data,
            `指令 "${command.name}" 冷却中，请 ${getCooldownRemaining(data, command.name, command.cooldown || 0) / 1000} 秒后再试。`
        );
        return;
    }

    const normalizedArgs = command.normalizeArgs ? command.normalizeArgs(resolvedArgs) : resolvedArgs;
    if (!normalizedArgs) {
        await reply(client, data, `参数检定未通过。\n用法：\n${resolveCommandUsage(command, ...resolvedArgs)}`);
        return;
    }

    if (command.validateArgs) {
        const validateResult = command.validateArgs(normalizedArgs);
        if (!validateResult) {
            await reply(client, data, `参数检定未通过。\n用法：\n${resolveCommandUsage(command, ...normalizedArgs)}`);
            return;
        }
    }

    try {
        await command.execute(normalizedArgs, client, data as never, replyMessageId);
    } catch (error) {
        logger.error(`Error executing command ${commandName}:`, error);
        await reply(client, data, `执行失败。\n用法：\n${resolveCommandUsage(command, ...resolvedArgs)}`);
    }
}

export function setupMessageHandler() {
    registerMessageHandler({
        name: 'command',
        order: 100,
        group: handleMessage,
        private: handleMessage
    });
    setInterval(cleanupCooldowns, 60 * 60 * 1000);
}
