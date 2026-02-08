import { Command, CommandScope } from '.';
import { NapLink } from "@naplink/naplink";
import { OneBotV11 } from "@onebots/protocol-onebot-v11/lib";

export class EchoCommand implements Command<OneBotV11.GroupMessageEvent> {
    name = 'echo';
    description = 'Echoes the input back to the user. Usage: echo [message]';
    scope: CommandScope = 'group';

    async execute(args: string[], client: NapLink, data: OneBotV11.GroupMessageEvent): Promise<void> {
        const message = args.join(' ');
        await client.sendGroupMessage(data.group_id, message);
    }
}