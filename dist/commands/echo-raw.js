import { MessageBuilder } from "@/utils/message-builder";
import { getTargetId, sendAutoMessage } from '@/utils/client';
export class EchoRawCommand {
    name = 'echo.raw';
    description = 'Echoes the input back to the user without parsing CQ Code. Usage: echo.raw [message]';
    usage = '/echo.raw <message>';
    scope = 'group';
    async execute(args, client, data) {
        const message = args.join(' ');
        await sendAutoMessage(client, false, getTargetId(data), new MessageBuilder().text(message).build());
    }
}
