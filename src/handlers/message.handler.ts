import { NapLink } from "@naplink/naplink";
import { AllMessageEvent, commands, resolveCommandUsage } from "@/commands";
import { logger } from "@/utils/logger";
import { config } from "@/config";
import { OneBotV11 } from "@onebots/protocol-onebot-v11/lib";
import { MessageBuilder } from "@/utils/message-builder";
import { isSuperUser } from "@/utils/permission";
import { db } from "@/db";
import { and, eq, isNull } from "drizzle-orm";
import { commandAliases } from "@/db/schema";
import { getTargetId, sendAutoMessage } from "@/utils/client";

const cooldowns = new Map<string, number>();

type AliasScope = {
    scopeType: 'group' | 'private';
    scopeId: number;
};

function isPrivateMessage(data: AllMessageEvent): data is OneBotV11.PrivateMessageEvent {
    return data.message_type === 'private';
}

function resolveStaticCommand(commandName: string) {
    return commands.find(cmd => cmd.name === commandName || cmd.aliases?.includes(commandName));
}

function isRegexSafe(pattern: string): boolean {
    // Limit pattern length to prevent memory exhaustion
    const MAX_PATTERN_LENGTH = 200;
    if (pattern.length > MAX_PATTERN_LENGTH) {
        return false;
    }

    // Check for nested quantifiers that can cause catastrophic backtracking
    // Patterns like (a+)+ or (a*)* or (a+)* are dangerous.
    // This scan is escape-aware and ignores characters inside character classes.
    const quantifierChars = new Set(["*", "+", "?", "{"]);

    const isUnescapedQuantifier = (index: number, inCharClass: boolean): boolean => {
        if (inCharClass) {
            return false;
        }
        const ch = pattern[index];
        if (!quantifierChars.has(ch)) {
            return false;
        }
        // Check if escaped: count preceding backslashes
        let backslashCount = 0;
        for (let i = index - 1; i >= 0 && pattern[i] === "\\"; i--) {
            backslashCount++;
        }
        return backslashCount % 2 === 0;
    };

    type GroupState = { hasInnerQuantifier: boolean };
    const groupStack: GroupState[] = [];
    let inCharClass = false;

    for (let i = 0; i < pattern.length; i++) {
        const ch = pattern[i];

        // Handle escape: skip the escaped character
        if (ch === "\\") {
            i++;
            continue;
        }

        // Handle character classes
        if (ch === "[" && !inCharClass) {
            inCharClass = true;
            continue;
        }
        if (ch === "]" && inCharClass) {
            inCharClass = false;
            continue;
        }

        // Track groups
        if (ch === "(" && !inCharClass) {
            groupStack.push({ hasInnerQuantifier: false });
            continue;
        }
        if (ch === ")" && !inCharClass && groupStack.length > 0) {
            const finishedGroup = groupStack.pop()!;

            // Look ahead for a quantifier applied to this group
            let j = i + 1;
            // Skip whitespace between group and quantifier
            while (j < pattern.length && /\s/.test(pattern[j])) {
                j++;
            }
            if (j < pattern.length && isUnescapedQuantifier(j, inCharClass) && finishedGroup.hasInnerQuantifier) {
                // Found something like (a+)+ or (a*)* or (a+)* etc.
                return false;
            }
            continue;
        }

        // Mark quantifiers inside groups
        if (groupStack.length > 0 && isUnescapedQuantifier(i, inCharClass)) {
            groupStack[groupStack.length - 1].hasInnerQuantifier = true;
        }
    }

    // Check for potentially problematic patterns with multiple quantifiers
    // e.g., .*.*  or .+.+ or similar patterns
    const multipleWildcardQuantifiers = /\.\*.*\.\*|\.\+.*\.\+/;
    if (multipleWildcardQuantifiers.test(pattern)) {
        return false;
    }

    return true;
}

function parseRegexTemplate(template: string): { pattern: RegExp; replacement: string } | null {
    try {
        const match = template.match(/^s\/((?:\\.|[^/])*)\/((?:\\.|[^/])*)\/([dgimsuvy]*)$/);
        if (!match) {
            return null;
        }
        const [, rawPattern, rawReplacement, flags] = match;
        const unescapedPattern = rawPattern.replaceAll('\\/', '/');
        
        // Validate pattern safety
        if (!isRegexSafe(unescapedPattern)) {
            return null;
        }

        const pattern = new RegExp(unescapedPattern, flags);
        const replacement = rawReplacement.replaceAll('\\/', '/');
        return { pattern, replacement };
    } catch {
        return null;
    }
}

async function resolveCommand(commandName: string, args: string[], aliasScope: AliasScope) {
    const staticCommand = resolveStaticCommand(commandName);
    if (staticCommand) {
        return { command: staticCommand, args };
    }

    const alias = await db.query.commandAliases.findFirst({
        where: (alias, { and, eq }) => and(
            eq(alias.alias, commandName),
            eq(alias.scopeType, aliasScope.scopeType),
            eq(alias.scopeId, aliasScope.scopeId)
        )
    }) ?? await db.query.commandAliases.findFirst({
        where: and(
            eq(commandAliases.alias, commandName),
            eq(commandAliases.scopeType, 'global'),
            isNull(commandAliases.scopeId)
        )
    });
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
    
    // Only allow regex templates for global aliases (which require superuser to create)
    // to prevent ReDoS attacks from user-created aliases
    // Global aliases have scopeType='global' and scopeId=null
    const isGlobalAlias = alias.scopeType === 'global' && alias.scopeId === null;
    const regexTemplate = isGlobalAlias ? parseRegexTemplate(alias.argTemplate) : null;
    
    if (regexTemplate) {
        const replaced = joinedArgs.replace(regexTemplate.pattern, regexTemplate.replacement).trim();
        return { command, args: replaced ? replaced.split(/\s+/) : [] };
    }

    const interpolated = alias.argTemplate
        .replaceAll('{args}', joinedArgs)
        .replace(/\{(\d+)\}/g, (_, indexText) => args[Number(indexText) - 1] ?? '')
        .trim();

    return { command, args: interpolated ? interpolated.split(/\s+/) : [] };
}

async function sendReply(client: NapLink, data: AllMessageEvent, text: string) {
    const isPrivate = isPrivateMessage(data);
    const message = new MessageBuilder()
        .reply(data.message_id)
        .atIf(!isPrivate, data.user_id)
        .text(text)
        .build();
    await sendAutoMessage(client, isPrivate, getTargetId(data), message);
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

    const members = await client.getGroupMemberList(data.group_id) as OneBotV11.GroupMemberInfo[];
    const isOrdinaryMember = members.some(member => member.user_id === data.user_id && member.role === 'member');
    if (!isOrdinaryMember) {
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
        scopeId: isPrivateMessage(data) ? data.user_id : data.group_id,
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

    if (!(await checkCooldown(client, data, command.name, command.cooldown || 0))) {
        return;
    }

    if (command.validateArgs) {
        const validateResult = await command.validateArgs(resolvedArgs, client, data as never);
        if (validateResult !== true) {
            if (validateResult !== 'replied') {
                await sendReply(client, data, `参数检定未通过。\n用法：\n${resolveCommandUsage(command, resolvedArgs[0])}`);
            }
            return;
        }
    }

    try {
        await command.execute(resolvedArgs, client, data as never);
    } catch (error) {
        logger.error(`Error executing command ${commandName}:`, error);
        await sendReply(client, data, `执行失败。\n用法：\n${resolveCommandUsage(command, resolvedArgs[0])}`);
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
