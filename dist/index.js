import { client } from '@/napcat-client';
import { setupMessageHandler } from '@/handlers/message.handler';
client.connect().then(() => setupMessageHandler(client));
