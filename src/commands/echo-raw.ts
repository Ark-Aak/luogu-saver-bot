import { Command, CommandScope } from '.';
import { NapLink } from "@naplink/naplink";
import { OneBotV11 } from "@onebots/protocol-onebot-v11/lib";
import { MessageBuilder } from "@/utils/message-builder";

export class EchoRawCommand implements Command<OneBotV11.GroupMessageEvent> {
    name = 'echo.raw';
    description = 'Echoes the input back to the user without parsing CQ Code. Usage: echo.raw [message]';
    scope: CommandScope = 'group';

    async execute(args: string[], client: NapLink, data: OneBotV11.GroupMessageEvent): Promise<void> {
        const message = args.join(' ');
        await client.sendGroupMessage(data.group_id, new MessageBuilder().text(message).build());
    }
}