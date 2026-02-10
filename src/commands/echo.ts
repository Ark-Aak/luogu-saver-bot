import { Command, CommandScope } from '.';
import { NapLink } from "@naplink/naplink";
import { OneBotV11 } from "@onebots/protocol-onebot-v11/lib";
import { getTargetId, sendAutoMessage } from '@/utils/client';
import { MessageBuilder } from '@/utils/message-builder';

export class EchoCommand implements Command<OneBotV11.GroupMessageEvent> {
    name = 'echo';
    description = 'Echoes the input back to the user. Usage: echo [message]';
    usage = '/echo <message>';
    scope: CommandScope = 'group';
    superUserOnly = true;

    async execute(args: string[], client: NapLink, data: OneBotV11.GroupMessageEvent): Promise<void> {
        const message = args.join(' ');
        await sendAutoMessage(client, false, getTargetId(data), new MessageBuilder().text(message).build());
    }
}
