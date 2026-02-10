import { getTargetId, sendAutoMessage } from '@/utils/client';
import { MessageBuilder } from '@/utils/message-builder';
export class EchoCommand {
    name = 'echo';
    description = 'Echoes the input back to the user. Usage: echo [message]';
    usage = '/echo <message>';
    scope = 'group';
    async execute(args, client, data) {
        const message = args.join(' ');
        await sendAutoMessage(client, false, getTargetId(data), new MessageBuilder().text(message).build());
    }
}
