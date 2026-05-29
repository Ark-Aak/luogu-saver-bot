import { NapLink } from '@naplink/naplink';
import { OneBotV11 } from '@onebots/protocol-onebot-v11/lib';
import { sendMessage } from '@/utils/client';
import { Command, CommandScope } from '@/types';

export class EchoParseCommand implements Command<OneBotV11.GroupMessageEvent> {
    name = 'echo.parse';
    description = '直接输出输入的参数，翻译文本 CQ 码。';
    usage = '/echo.parse <message>';
    scope: CommandScope = 'group';
    superUserOnly = true;

    async execute(args: string[], client: NapLink, data: OneBotV11.GroupMessageEvent): Promise<void> {
        let processedMessages: string[] = [];
        args.forEach((arg) => {
            processedMessages.push(
                arg.replace(/&#91;/g, '[').replace(/&#93;/g, ']').replace(/&#44;/g, ',').replace(/&amp;/g, '&')
            )
        });
        await sendMessage(client, data, processedMessages.join(' '));
    }
}
