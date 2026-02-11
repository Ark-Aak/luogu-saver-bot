import { config } from '@/config';
import { NapLink } from '@naplink/naplink';
import { OneBotV11 } from '@onebots/protocol-onebot-v11/lib';

export function isSuperUser(id: number) {
    return config.napcat.superuser.includes(id);
}

export async function isAdminByData(client: NapLink, data: OneBotV11.GroupMessageEvent): Promise<boolean> {
    const { group_id, user_id: id } = data;
    const memberList = (await client.getGroupMemberList(group_id)) as OneBotV11.GroupMemberInfo[];
    return memberList.some(member => member.user_id === id && (member.role === 'admin' || member.role === 'owner'));
}

export async function isAdminById(client: NapLink, userId: number, groupId: number): Promise<boolean> {
    const memberList = (await client.getGroupMemberList(groupId)) as OneBotV11.GroupMemberInfo[];
    return memberList.some(member => member.user_id === userId && (member.role === 'admin' || member.role === 'owner'));
}
