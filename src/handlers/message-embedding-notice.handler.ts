import { NapLink } from '@naplink/naplink';
import { OneBotV11 } from '@onebots/protocol-onebot-v11/lib';
import { config } from '@/config';
import { db } from '@/db';
import { claimMessageEmbeddingNotice, releaseMessageEmbeddingNoticeClaim } from '@/helpers/message-embedding';
import { registerEventHandler } from '@/handlers/registry';
import { sendGroupMessage } from '@/utils/client';
import { logSanitizedError } from '@/utils/error';
import { logger } from '@/utils/logger';
import { MessageBuilder } from '@/utils/message-builder';

type GroupIncreaseEvent = Pick<OneBotV11.GroupIncreaseNotice, 'notice_type' | 'group_id' | 'user_id' | 'self_id'>;

function isGroupIncreaseEvent(event: unknown): event is GroupIncreaseEvent {
    if (typeof event !== 'object' || event === null) return false;
    return (
        'notice_type' in event &&
        event.notice_type === 'group_increase' &&
        'group_id' in event &&
        typeof event.group_id === 'number' &&
        Number.isSafeInteger(event.group_id) &&
        'user_id' in event &&
        typeof event.user_id === 'number' &&
        Number.isSafeInteger(event.user_id) &&
        'self_id' in event &&
        typeof event.self_id === 'number' &&
        Number.isSafeInteger(event.self_id)
    );
}

async function handleMessageEmbeddingNotice(client: NapLink, event: unknown): Promise<void> {
    if (!isGroupIncreaseEvent(event) || event.user_id === event.self_id) return;

    const claimedAt = Date.now();
    const claim = claimMessageEmbeddingNotice(db, event.user_id, claimedAt);
    if (!claim) return;

    const embeddingCommand = `${config.command.prefix}embedding`;
    const text = claim.optedOut
        ? `本群启用了消息向量画像。你当前已处于退出状态，不会采集和存储你的群消息；如需重新加入，可发送 ${embeddingCommand} opt-in。本提示只发送一次。`
        : `本群启用了消息向量画像，群消息会经 Embedding 计算并用于群均值和跨群个人特征，只会保存向量化后的数据，不会保存也无法反推原文。若不希望参与，请发送 ${embeddingCommand} opt-out；未退出视为同意采集。退出后可随时发送 ${embeddingCommand} opt-in 重新加入。本提示只发送一次。`;

    try {
        const result = await sendGroupMessage(
            client,
            event.group_id,
            new MessageBuilder().at(event.user_id).text(text).build()
        );
        if (result === null) releaseMessageEmbeddingNoticeClaim(db, event.user_id, claimedAt);
    } catch (error) {
        releaseMessageEmbeddingNoticeClaim(db, event.user_id, claimedAt);
        logSanitizedError(
            logger,
            `Failed to send message embedding privacy notice to user ${event.user_id} in group ${event.group_id}`,
            error
        );
    }
}

export function setupMessageEmbeddingNoticeHandler(): void {
    registerEventHandler({
        name: 'message-embedding-notice',
        order: 100,
        moduleName: 'message-embedding',
        events: ['notice.group_increase'],
        handler: handleMessageEmbeddingNotice
    });
}
