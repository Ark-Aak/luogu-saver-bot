import { client } from '@/napcat-client';

import { setupMessageHandler } from '@/handlers/message.handler';
import { scheduleGachaJobs } from '@/jobs/gacha';
import { scheduleGachaHintJobs } from "@/jobs/gacha-hint";

client.connect().then(() => {
    setupMessageHandler(client);
    scheduleGachaJobs(client);
    scheduleGachaHintJobs(client)
});
