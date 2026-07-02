import { NapLink } from '@naplink/naplink';
import { OneBotV11 } from '@onebots/protocol-onebot-v11/lib';

export type RegisteredMessageHandler = {
    name: string;
    order: number;
    group?: (client: NapLink, data: OneBotV11.GroupMessageEvent) => Promise<void>;
    private?: (client: NapLink, data: OneBotV11.PrivateMessageEvent) => Promise<void>;
};

export type RegisteredEventHandler = {
    name: string;
    order: number;
    events: string[];
    handler: (client: NapLink, event: any) => Promise<void>;
}

const messageHandlers: RegisteredMessageHandler[] = [];
const eventHandlers: RegisteredEventHandler[] = [];

export function registerMessageHandler(handler: RegisteredMessageHandler): void {
    messageHandlers.push(handler);
    messageHandlers.sort((a, b) => a.order - b.order);
}

export function registerEventHandler(handler: RegisteredEventHandler): void {
    eventHandlers.push(handler);
    eventHandlers.sort((a, b) => a.order - b.order);
}

export function setupRegisteredMessageHandlers(client: NapLink): void {
    client.on('message.group', async (data: OneBotV11.GroupMessageEvent) => {
        for (const handler of messageHandlers) {
            await handler.group?.(client, data);
        }
    });

    client.on('message.private', async (data: OneBotV11.PrivateMessageEvent) => {
        for (const handler of messageHandlers) {
            await handler.private?.(client, data);
        }
    });
}

export function setupRegisteredEventHandlers(client: NapLink): void {
    for (const handler of eventHandlers) {
        for (const event of handler.events) {
            client.on(event, async (data: any) => {
                await handler.handler(client, data);
            });
        }
    }
}
