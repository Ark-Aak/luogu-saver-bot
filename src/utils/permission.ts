import { config } from '@/config';
import { NapLink } from '@naplink/naplink';
import { OneBotV11 } from '@onebots/protocol-onebot-v11/lib';

export function isSuperUser(id: number) {
    return config.napcat.superuser.includes(id);
}

export async function isAdminByData(client: NapLink, data: OneBotV11.GroupMessageEvent): Promise<boolean> {
    const { group_id, user_id: id } = data;
    const memberInfo = (await client.getGroupMemberInfo(group_id, id)) as OneBotV11.GroupMemberInfo;
    return memberInfo.role === 'admin' || memberInfo.role === 'owner';
}

export async function isAdminById(client: NapLink, userId: number, groupId: number): Promise<boolean> {
    const memberInfo = (await client.getGroupMemberInfo(groupId, userId)) as OneBotV11.GroupMemberInfo;
    return memberInfo.role === 'admin' || memberInfo.role === 'owner';
}
