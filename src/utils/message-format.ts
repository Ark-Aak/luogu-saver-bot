import { NapLink } from '@naplink/naplink';
import { OneBotV11 } from '@onebots/protocol-onebot-v11/lib';
import { MessageBuilder } from '@/utils/message-builder';
import { getTargetId, sendAutoMessage } from '@/utils/client';
import { AllMessageEvent } from '@/commands';

type MessageEvent = OneBotV11.GroupMessageEvent | OneBotV11.PrivateMessageEvent;

export async function sendCommandUsage(
    client: NapLink,
    data: MessageEvent,
    usage: string,
    text: string
): Promise<void> {
    const isPrivate = data.message_type === 'private';
    const msg = new MessageBuilder()
        .reply(data.message_id)
        .atIf(!isPrivate, data.user_id)
        .text(`${text}\n用法：\n${usage}`)
        .build();
    await sendAutoMessage(client, isPrivate, getTargetId(data), msg);
}

export const reply = async (
    client: NapLink,
    data: AllMessageEvent,
    isPrivate: boolean,
    text: string
) => {
    const msg = new MessageBuilder()
        .reply(data.message_id)
        .atIf(isPrivate, data.user_id)
        .text(text)
        .build();
    await sendAutoMessage(client, false, getTargetId(data), msg);
};
