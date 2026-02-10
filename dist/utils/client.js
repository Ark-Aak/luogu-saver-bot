export async function sendPrivateMessageIf(client, condition, userId, message) {
    if (condition) {
        await client.sendPrivateMessage(userId, message);
    }
}
export async function sendGroupMessageIf(client, condition, groupId, message) {
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
export async function sendAutoMessage(client, condition, id, message) {
    await sendPrivateMessageIf(client, condition, id, message);
    await sendGroupMessageIf(client, !condition, id, message);
}
export function getTargetId(data) {
    return data.message_type === 'private' ? data.user_id : data.group_id;
}
