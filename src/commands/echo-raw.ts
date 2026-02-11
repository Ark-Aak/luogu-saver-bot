import { NapLink } from '@naplink/naplink';
import { OneBotV11 } from '@onebots/protocol-onebot-v11/lib';
import { sendMessage } from '@/utils/client';
import { Command, CommandScope } from '@/types';

export class EchoRawCommand implements Command<OneBotV11.GroupMessageEvent> {
    name = 'echo.raw';
    description = '直接输出输入的参数，不翻译 CQ 码。';
    usage = '/echo.raw <message>';
    scope: CommandScope = 'group';
    superUserOnly = true;

    async execute(args: string[], client: NapLink, data: OneBotV11.GroupMessageEvent): Promise<void> {
        const message = args.join(' ');
        await sendMessage(client, data, message, true);
    }
}
