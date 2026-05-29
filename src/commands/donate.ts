import { AllMessageEvent, Command, CommandScope } from "@/types";
import { NapLink } from "@naplink/naplink";
import { sendMessage } from "@/utils/client";
import { MessageSegment } from "@/types/message";

export class DonateCommand implements Command<AllMessageEvent> {
    name = 'donate';
    description = '发送收款码';
    usage = '/donate';
    aliases = ['赞助'];
    scope: CommandScope = 'both';

    async execute(_args: string[], client: NapLink, data: AllMessageEvent): Promise<void> {
        const message: MessageSegment[] = [
            {
                type: 'image',
                data: {
                    url: 'https://mydisk.cn-nb1.rains3.com/08a2b7da-4e65-400d-ad6c-731c63ee18a5.jpeg'
                }
            }
        ];
        await sendMessage(client, data, message);
    }
}