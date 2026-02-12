import { NapLink } from '@naplink/naplink';
import { SpamDetector } from '@/helpers/anti-spam';
import { OneBotV11 } from '@onebots/protocol-onebot-v11/lib';
import { config } from '@/config';
import { isAdminByData, isSuperUser } from '@/utils/permission';

export function setupAntiSpamHandler(client: NapLink) {
    const detectors = new Map<number, SpamDetector>();

    client.on('message.group', async (data: OneBotV11.GroupMessageEvent) => {
        if (!config.antiSpam.enabled) return;
        if (isSuperUser(data.user_id) || (await isAdminByData(client, data))) {
            return;
        }
        const spamDetector = detectors.get(data.group_id) || new SpamDetector(config.antiSpam);
        const result = spamDetector.detect(data.user_id, data.raw_message);
        if (result.isSpam) {
            console.log(
                `Detected spam from user ${data.user_id} in group ${data.group_id}: ${result.reason}, level ${result.level}`
            );
            try {
                await client.deleteMessage(data.message_id);
                const time = Math.min(
                    config.antiSpam.banDurationBase * Math.pow(2, Math.min(25, (result.level ?? 1) - 1)),
                    60 * 60 * 24 * 30
                );
                await client.setGroupBan(data.group_id, data.user_id, time);
                // 记录禁言信息到检测器，用于计算衰减延迟
                spamDetector.recordBan(data.user_id, time);
            } catch {}
        }
        detectors.set(data.group_id, spamDetector);
    });
}
