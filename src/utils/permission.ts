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
        const memberInfo = await client.getGroupMemberInfo(groupId, userId) as OneBotV11.GroupMemberInfo;
        return memberInfo.role === 'admin' || memberInfo.role === 'owner';
    } catch {
        return false;
    }
}