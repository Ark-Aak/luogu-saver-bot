import { client } from '@/napcat-client';

await client.connect();

import { setupMessageHandler } from '@/handlers/message.handler';

setupMessageHandler(client);