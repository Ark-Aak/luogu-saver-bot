import { NapLink } from '@naplink/naplink';
import { SpamDetector } from '@/helpers/anti-spam';
import { OneBotV11 } from '@onebots/protocol-onebot-v11/lib';
import { config } from "@/config";
import { isAdminByData, isSuperUser } from "@/utils/permission";

export function setupAntiSpamHandler(client: NapLink) {
    const spamDetector = new SpamDetector();

    client.on('message.group', async (data: OneBotV11.GroupMessageEvent) => {
        if (isSuperUser(data.user_id) || isAdminByData(data)) {
            return;
        }
        const result = spamDetector.detect(data.user_id, data.raw_message);
        if (result.isSpam) {
            console.log(`Detected spam from user ${data.user_id} in group ${data.group_id}: ${result.reason}, level ${result.level}`);
            try {
                await client.deleteMessage(data.message_id);
                await client.setGroupBan(data.group_id, data.user_id, config.antiSpam.banDurationBase * Math.pow(2, (result.level ?? 1) - 1));
            } catch {}
        }
    });
}
