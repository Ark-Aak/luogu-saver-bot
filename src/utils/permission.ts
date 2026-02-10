import { config } from "@/config";
import { NapLink } from '@naplink/naplink';
import { OneBotV11 } from '@onebots/protocol-onebot-v11/lib';

export function isSuperUser(id: number) {
    return config.napcat.superuser.includes(id);
}

export async function isAdminOrSuperUser(client: NapLink, userId: number, groupId?: number): Promise<boolean> {
    if (isSuperUser(userId)) {
        return true;
    }
    
    if (!groupId) {
        return false;
    }
    
    try {
        const members = await client.getGroupMemberList(groupId) as OneBotV11.GroupMemberInfo[];
        const member = members.find(m => m.user_id === userId);
        return member ? (member.role === 'admin' || member.role === 'owner') : false;
    } catch {
        return false;
    }
}