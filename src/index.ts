import { client } from '@/napcat-client';

import { setupMessageHandler } from '@/handlers/message.handler';
import { scheduleGachaJobs } from '@/jobs/gacha';

client.connect().then(() => {
    setupMessageHandler(client);
    scheduleGachaJobs(client);
});
