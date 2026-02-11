import { NapLink } from '@naplink/naplink';
import { commands, resolveCommandUsage } from '@/commands';
import { logger } from '@/utils/logger';
import { config } from '@/config';
import { OneBotV11 } from '@onebots/protocol-onebot-v11/lib';
import { isAdminByData, isSuperUser } from '@/utils/permission';
import { db } from '@/db';
import { and, eq, isNull } from 'drizzle-orm';
import { commandAliases } from '@/db/schema';
import { reply } from '@/utils/client';
import { AliasScope, AllMessageEvent } from '@/types';

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

    if (!(await isAdminByData(client, data))) {
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

async function handleMessage(client: NapLink, data: AllMessageEvent) {
    if (!data.raw_message.startsWith(config.command.prefix)) {
        return;
    }

    const rawBody = data.raw_message.slice(config.command.prefix.length);
    const [commandName, ...args] = rawBody.split(' ');
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

    if (command.superUserOnly && !isSuperUser(data.user_id)) {
        logger.warn(
            `Command ${commandName} requires super user permission, but user ${data.user_id} is not a super user.`
        );
        await reply(client, data, '权限不足，该命令仅限超级管理员使用。');
        return;
    }

    if (!(await checkCooldown(client, data, commandName, command.cooldown || 0))) {
        return;
    }

    if (command.validateArgs) {
        const validateResult = command.validateArgs(resolvedArgs);
        if (!validateResult) {
            await reply(client, data, `参数检定未通过。\n用法：\n${resolveCommandUsage(command, resolvedArgs[0])}`);
            return;
        }
    }

    try {
        await command.execute(resolvedArgs, client, data as never);
    } catch (error) {
        logger.error(`Error executing command ${commandName}:`, error);
        await reply(client, data, `执行失败。\n用法：\n${resolveCommandUsage(command, resolvedArgs[0])}`);
    }
}

export function setupMessageHandler(client: NapLink) {
    client.on('message.group', async (data: OneBotV11.GroupMessageEvent) => {
        await handleMessage(client, data);
    });

    client.on('message.private', async (data: OneBotV11.PrivateMessageEvent) => {
        await handleMessage(client, data);
    });
}
