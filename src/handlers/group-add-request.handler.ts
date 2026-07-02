import { registerEventHandler } from '@/handlers/registry';
import { NapLink } from '@naplink/naplink';
import { OneBotV11 } from '@onebots/protocol-onebot-v11/lib';
import { config } from '@/config';
import { sendGroupMessage } from '@/utils/client';
import { db } from '@/db';
import { groupBlacklists } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

export function setupGroupAddRequestHandler() {
    registerEventHandler({
        name: 'group-add-request-handler',
        order: 100,
        events: ['request.group'],
        handler: async (client: NapLink, event: OneBotV11.GroupRequestEvent) => {
            if (event.sub_type !== 'add') return;
            const message = event.comment ?? '';
            const groupId = event.group_id;

            const blacklistRecord = await db.query.groupBlacklists.findFirst({
                where: and(eq(groupBlacklists.groupId, groupId), eq(groupBlacklists.userId, event.user_id))
            });

            if (blacklistRecord) {
                const reason = blacklistRecord.reason
                    ? `你已被本群拉黑。原因：${blacklistRecord.reason}`
                    : '你已被本群拉黑。';
                await client.handleGroupRequest(event.flag, event.sub_type, false, reason);
                await sendGroupMessage(
                    client,
                    groupId,
                    `已自动拒绝 ${event.user_id} 的加群请求：该用户在本群黑名单中。${blacklistRecord.reason ? `\n原因：${blacklistRecord.reason}` : ''}`
                );
                return;
            }

            const autoApproveKeywords = config.group.autoApproveKeywords.filter(keyword => keyword.length > 0);
            if (autoApproveKeywords.some(keyword => message.includes(keyword))) {
                await client.handleGroupRequest(event.flag, event.sub_type, true);
                await sendGroupMessage(
                    client,
                    groupId,
                    `已自动通过 ${event.user_id} 的加群请求，验证消息：${message}。`
                );
            } else {
                await sendGroupMessage(client, groupId, `收到 ${event.user_id} 的加群请求，验证消息：${message}。`);
            }
        }
    });
}
