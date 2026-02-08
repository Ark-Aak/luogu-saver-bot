import { NapLink } from "@naplink/naplink";
import { OneBotV11 } from "@onebots/protocol-onebot-v11/lib";

export async function sendPrivateMessageIf(client: NapLink, condition: boolean, userId: number, message: any) {
    if (condition) {
        await client.sendPrivateMessage(userId, message);
    }
}

export async function sendGroupMessageIf(client: NapLink, condition: boolean, groupId: number, message: any) {
    if (condition) {
        await client.sendGroupMessage(groupId, message);
    }
}

/*
 * 根据条件发送消息，如果 condition 为 true 则发送私聊消息，否则发送群消息
 * @param client NapLink 客户端实例
 * @param condition 条件，true 发送私聊消息，false 发送群消息
 * @param id 用户 ID 或群 ID，根据 condition 决定
 * @param message 要发送的消息内容
 */
export async function sendAutoMessage(client: NapLink, condition: boolean, id: number, message: any) {
    await sendPrivateMessageIf(client, condition, id, message);
    await sendGroupMessageIf(client, !condition, id, message);
}

export function getTargetId(data: OneBotV11.GroupMessageEvent | OneBotV11.PrivateMessageEvent): number {
    return data.message_type === 'private' ? data.user_id : data.group_id;
}