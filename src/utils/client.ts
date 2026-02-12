import { NapLink } from '@naplink/naplink';
import { MessageSegment } from '@/types/message';
import { OneBotV11 } from '@onebots/protocol-onebot-v11/lib';
import { MessageBuilder } from '@/utils/message-builder';
import { AllMessageEvent } from '@/types';
import { config } from '@/config';
import { logger } from '@/utils/logger';

export function isPrivate(data: AllMessageEvent): data is OneBotV11.PrivateMessageEvent {
    return data.message_type === 'private';
}

export function isGroup(data: AllMessageEvent): data is OneBotV11.GroupMessageEvent {
    return data.message_type === 'group';
}

export function calculateTextLength(data: MessageSegment[]) {
    let sum = 0;
    for (const segment of data) {
        if (segment.type === 'text') {
            sum += segment.data.text.length;
        } else if (segment.type === 'face') {
            sum += 1;
        } else if (segment.type === 'image') {
            sum += 100;
        } else if (segment.type === 'at') {
            sum += 5;
        } else if (segment.type === 'reply') {
            sum += 0;
        } else {
            sum += 1;
        }
    }
    return sum;
}

export function calculateTextLines(data: MessageSegment[]) {
    let sum = 0;
    for (const segment of data) {
        if (segment.type === 'text') {
            sum += segment.data.text.split('\n').length;
        } else if (segment.type === 'image') {
            sum += 3;
        }
    }
    return sum;
}

/*
 * 根据条件发送消息，如果 condition 为 true 则发送私聊消息，否则发送群消息
 * @param client NapLink 客户端实例
 * @param condition 条件，true 发送私聊消息，false 发送群消息
 * @param id 用户 ID 或群 ID，根据 condition 决定
 * @param message 要发送的消息内容
 * @param autoEscape 是否不翻译消息中的 CQ 码，默认为 false
 * @param noShrink 是否禁止长消息转合并转发消息，默认为 false
 * @return 发送消息的响应结果
 */
export async function sendMessage(
    client: NapLink,
    data: AllMessageEvent,
    message: MessageSegment[] | string,
    autoEscape: boolean = false,
    noShrink: boolean = false
): Promise<OneBotV11.SendMessageResponse> {
    const messageLength = typeof message === 'string' ? message.length : calculateTextLength(message);
    const messageLines = typeof message === 'string' ? message.split('\n').length - 1 : calculateTextLines(message);
    const needShrink = messageLength > config.napcat.charThreshold || messageLines > config.napcat.lineThreshold;
    logger.info(`Sending message. Length: ${messageLength}, Lines: ${messageLines}, Need shrink: ${needShrink}`);
    if (!needShrink || isPrivate(data) || noShrink) {
        return await client.sendMessage({
            message_type: isPrivate(data) ? 'private' : 'group',
            user_id: isPrivate(data) ? data.user_id : undefined,
            group_id: isGroup(data) ? data.group_id : undefined,
            message: message,
            auto_escape: autoEscape
        });
    } else {
        const loginInfo = (await client.getLoginInfo()) as OneBotV11.LoginInfo;
        return await client.sendGroupForwardMessage(data.group_id, [
            message instanceof Array
                ? new MessageBuilder().segment(message).buildNode(loginInfo)
                : (autoEscape ? new MessageBuilder().text(message) : new MessageBuilder().cqCode(message)).buildNode(
                      loginInfo
                  )
        ]);
    }
}

/*
 * 发送群消息
 * @param client NapLink 客户端实例
 * @param id 群 ID
 * @param message 要发送的消息内容，可以是字符串或 MessageSegment 数组
 * @param autoEscape 是否不翻译消息中的 CQ 码，默认为 false
 * @param noShrink 是否禁止长消息转合并转发消息，默认为 false
 * @return 发送消息的响应结果
 */
export async function sendGroupMessage(
    client: NapLink,
    id: number,
    message: MessageSegment[] | string,
    autoEscape: boolean = false,
    noShrink: boolean = false
) {
    return await sendMessage(
        client,
        { message_type: 'group', group_id: id } as AllMessageEvent,
        message,
        autoEscape,
        noShrink
    );
}

/*
 * 发送私聊消息
 * @param client NapLink 客户端实例
 * @param id QQ ID
 * @param message 要发送的消息内容，可以是字符串或 MessageSegment 数组
 * @param autoEscape 是否不翻译消息中的 CQ 码，默认为 false
 * @return 发送消息的响应结果
 */
export async function sendPrivateMessage(
    client: NapLink,
    id: number,
    message: MessageSegment[] | string,
    autoEscape: boolean = false
) {
    return await sendMessage(client, { message_type: 'private', user_id: id } as AllMessageEvent, message, autoEscape);
}

/*
 * 回复消息，自动根据消息类型选择回复方式
 * @param client NapLink 客户端实例
 * @param data 消息事件数据
 * @param msg 要回复的消息内容，可以是字符串或 MessageSegment 数组
 * @param autoEscape 是否不翻译消息中的 CQ 码，默认为 false
 * @return 发送消息的响应结果
 */

export async function reply(
    client: NapLink,
    data: AllMessageEvent,
    msg: string | MessageSegment[],
    autoEscape: boolean = false
): Promise<OneBotV11.SendMessageResponse> {
    const builder = new MessageBuilder().reply(data.message_id).atIf(isGroup(data), data.user_id);
    if (typeof msg === 'string') {
        if (autoEscape) {
            builder.text(msg);
        } else {
            builder.cqCode(msg);
        }
    } else {
        builder.segment(msg);
    }
    return await sendMessage(client, data, builder.build());
}
