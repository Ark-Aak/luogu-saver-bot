import { client } from '@/napcat-client';

import { setupMessageHandler } from '@/handlers/message.handler';
import { scheduleGachaJobs } from '@/jobs/gacha';
import { scheduleGachaHintJobs } from '@/jobs/gacha-hint';
import { setupAntiSpamHandler } from '@/handlers/anti-spam.handler';

client.connect().then(() => {
    setupMessageHandler(client);
    setupAntiSpamHandler(client);
    scheduleGachaJobs(client);
    scheduleGachaHintJobs(client);
});
