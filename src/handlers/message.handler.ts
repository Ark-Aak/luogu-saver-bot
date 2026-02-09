import { NapLink } from "@naplink/naplink";
import { commands } from "@/commands";
import { logger } from "@/utils/logger";
import { config } from "@/config";
import { OneBotV11 } from "@onebots/protocol-onebot-v11/lib";
import { MessageBuilder } from "@/utils/message-builder";
import { isSuperUser } from "@/utils/permission";

const cooldowns = new Map<string, number>();

export function setupMessageHandler(client: NapLink) {
    client.on('message.group', async (data: OneBotV11.GroupMessageEvent) => {
        if (!data.raw_message.startsWith(config.command.prefix)) return;
        data.raw_message = data.raw_message.slice(config.command.prefix.length);
        const [commandName, ...args] = data.raw_message.split(' ');
        const command = commands.find(cmd => cmd.name === commandName);
        if (command) {
            if (command.scope === 'private') {
                logger.warn(`Command ${commandName} is private-only and cannot be used in group chats.`);
                return;
            }
            try {
                if (command.validateArgs && !command.validateArgs(args)) {
                    await client.sendGroupMessage(
                        data.group_id,
                        new MessageBuilder()
                            .reply(data.message_id)
                            .at(data.user_id)
                            .text('参数检定未通过。')
                            .build()
                    );
                    return;
                }
                if (
                    (await client.getGroupMemberList(data.group_id) as OneBotV11.GroupMemberInfo[])
                        .some(member => member.user_id === data.user_id && member.role === 'member')
                ) {
                    if (
                        cooldowns.get(`group-${data.group_id}-${commandName}`) &&
                        Date.now() - cooldowns.get(`group-${data.group_id}-${commandName}`)! < (command.cooldown || 0)
                    ) {
                        logger.info(`Command ${commandName} is on cooldown in group ${data.group_id}.`);
                        return;
                    }
                    cooldowns.set(`group-${data.group_id}-${commandName}`, Date.now());
                }
                await command.execute(args, client, data);
            } catch (error) {
                logger.error(`Error executing command ${commandName}:`, error);
            }
        }
        else {
            logger.warn(`Unknown command: ${commandName}`);
        }
    });

    client.on('message.private', async (data: OneBotV11.PrivateMessageEvent) => {
        if (!data.raw_message.startsWith(config.command.prefix)) return;
        data.raw_message = data.raw_message.slice(config.command.prefix.length);
        const [commandName, ...args] = data.raw_message.split(' ');
        const command = commands.find(cmd => cmd.name === commandName);
        if (command) {
            if (command.scope === 'group') {
                logger.warn(`Command ${commandName} is group-only and cannot be used in private chats.`);
                return;
            }
            try {
                if (command.validateArgs && !command.validateArgs(args)) {
                    await client.sendPrivateMessage(
                        data.user_id,
                        new MessageBuilder()
                            .reply(data.message_id)
                            .text('参数检定未通过。')
                            .build()
                    );
                    return;
                }
                if (!isSuperUser(data.user_id)) {
                    if (
                        cooldowns.get(`private-${data.user_id}-${commandName}`) &&
                        Date.now() - cooldowns.get(`private-${data.user_id}-${commandName}`)! < (command.cooldown || 0)
                    ) {
                        logger.info(`Command ${commandName} is on cooldown in user ${data.user_id}.`);
                        return;
                    }
                    cooldowns.set(`private-${data.user_id}-${commandName}`, Date.now());
                }
                await command.execute(args, client, data);
            } catch (error) {
                logger.error(`Error executing command ${commandName}:`, error);
            }
        }
        else {
            logger.warn(`Unknown command: ${commandName}`);
        }
    });
}