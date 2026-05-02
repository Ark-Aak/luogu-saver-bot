import { NapLink } from '@naplink/naplink';
import { OneBotV11 } from '@onebots/protocol-onebot-v11/lib';

export type RegisteredMessageHandler = {
    name: string;
    order: number;
    group?: (client: NapLink, data: OneBotV11.GroupMessageEvent) => Promise<void>;
    private?: (client: NapLink, data: OneBotV11.PrivateMessageEvent) => Promise<void>;
};

const handlers: RegisteredMessageHandler[] = [];

export function registerMessageHandler(handler: RegisteredMessageHandler): void {
    handlers.push(handler);
    handlers.sort((a, b) => a.order - b.order);
}

export function setupRegisteredMessageHandlers(client: NapLink): void {
    client.on('message.group', async (data: OneBotV11.GroupMessageEvent) => {
        for (const handler of handlers) {
            await handler.group?.(client, data);
        }
    });

    client.on('message.private', async (data: OneBotV11.PrivateMessageEvent) => {
        for (const handler of handlers) {
            await handler.private?.(client, data);
        }
    });
}
