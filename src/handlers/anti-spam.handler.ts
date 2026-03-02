import { NapLink } from '@naplink/naplink';
import { SpamDetector } from '@/helpers/anti-spam';
import { OneBotV11 } from '@onebots/protocol-onebot-v11/lib';
import { config } from '@/config';
import { isAdminByData, isSuperUser } from '@/utils/permission';
import { logger } from '@/utils/logger';
import { VANILLA_QQ } from "@/constants/bot-qq";
import { isNeedShrink } from "@/utils/anti-spam";
import { MessageBuilder } from "@/utils/message-builder";

export function setupAntiSpamHandler(client: NapLink) {
    const detectors = new Map<number, SpamDetector>();

    client.on('message.group', async (data: OneBotV11.GroupMessageEvent) => {
        if (!config.antiSpam.enabled) return;
        if (isSuperUser(data.user_id) || (await isAdminByData(client, data))) {
            return;
        }
        if (data.user_id === VANILLA_QQ) {
            return;
        }
        if (isNeedShrink(data.message)) {
            await client.deleteMessage(data.message_id);
            const loginInfo: OneBotV11.LoginInfo = {
                user_id: data.user_id,
                nickname: (await client.getGroupMemberInfo(
                    data.group_id,
                    data.user_id
                ) as OneBotV11.GroupMemberInfo)?.nickname || 'QQ用户',
            }
            await client.sendGroupForwardMessage(
                data.group_id,
                [new MessageBuilder().segment(data.message).buildNode(loginInfo)]
            )
            return;
        }
        const spamDetector = detectors.get(data.group_id) || new SpamDetector(config.antiSpam);
        const result = spamDetector.detect(data.user_id, data.raw_message);
        if (result.isSpam) {
            logger.info(
                `Detected spam from user ${data.user_id} in group ${data.group_id}: ${result.reason}, level ${result.level}`
            );
            try {
                await client.deleteMessage(data.message_id);
                const time = Math.min(
                    config.antiSpam.banDurationBase * Math.pow(2, Math.min(25, (result.level ?? 1) - 1)),
                    60 * 60 * 24 * 30
                );
                spamDetector.recordBan(data.user_id, time);
                await client.setGroupBan(data.group_id, data.user_id, time);
            } catch {}
        }
        else {
            const now = Date.now();
            const isGoodMorning = data.raw_message === '早安';
            const isGoodNight = data.raw_message === '晚安';
            // 如果在晚上 22:00 之前发送晚安则禁言到次日 7:00，如果在早上 12:00 之后发送早安则禁言到当天 22:00
            if (isGoodMorning || isGoodNight) {
                const nextMorning = new Date();
                nextMorning.setHours(7, 0, 0, 0);
                if (nextMorning.getTime() < now) {
                    nextMorning.setDate(nextMorning.getDate() + 1);
                }
                const nextNight = new Date();
                nextNight.setHours(22, 0, 0, 0);
                if (nextNight.getTime() < now) {
                    nextNight.setDate(nextNight.getDate() + 1);
                }
                const banUntil = isGoodMorning ? nextNight : nextMorning;
                const banDuration = Math.ceil((banUntil.getTime() - now) / 1000);
                if (banDuration > 0) await client.setGroupBan(data.group_id, data.user_id, banDuration);
            }
        }
        detectors.set(data.group_id, spamDetector);
    });
}
