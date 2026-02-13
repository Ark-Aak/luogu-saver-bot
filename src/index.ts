Date.prototype.toLocaleString = function () {
    const Y = this.getFullYear();
    const M = String(this.getMonth() + 1).padStart(2, '0');
    const D = String(this.getDate()).padStart(2, '0');
    const h = String(this.getHours()).padStart(2, '0');
    const m = String(this.getMinutes()).padStart(2, '0');
    const s = String(this.getSeconds()).padStart(2, '0');
    return `${Y}/${M}/${D} ${h}:${m}:${s}`;
};

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
