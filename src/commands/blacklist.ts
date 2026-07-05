import { NapLink } from '@naplink/naplink';
import { OneBotV11 } from '@onebots/protocol-onebot-v11/lib';
import { and, eq } from 'drizzle-orm';
import { Command, CommandScope } from '@/types';
import { db } from '@/db';
import { groupBlacklists } from '@/db/schema';
import { normalizeUserTargets } from '@/utils/command-args';
import { reply } from '@/utils/client';
import { getErrorMessage } from '@/utils/error';
import { isAdminByData, isSuperUser } from '@/utils/permission';
import { isValidUser } from '@/utils/validator';

type BlacklistAction = 'add' | 'remove' | 'list';

export class BlacklistCommand implements Command<OneBotV11.GroupMessageEvent> {
    name = 'blacklist';
    aliases = ['群拉黑', '拉黑'];
    description = '管理本群加群黑名单。';
    usage = {
        add: '/blacklist add <QQ号/@用户> [原因]',
        remove: '/blacklist remove <QQ号/@用户>',
        list: '/blacklist list'
    };
    scope: CommandScope = 'group';

    normalizeArgs(args: string[]): string[] | null {
        if (args[0] === 'add' || args[0] === 'remove') {
            return normalizeUserTargets(1)(args);
        }
        if (args[0] === 'list') {
            return args;
        }
        return normalizeUserTargets(0)(args);
    }

    validateArgs(args: string[]): boolean {
        if (args.length === 0) return false;
        if (args[0] === 'add') return args.length >= 2 && isValidUser(args[1]);
        if (args[0] === 'remove') return args.length === 2 && isValidUser(args[1]);
        if (args[0] === 'list') return args.length === 1;
        return isValidUser(args[0]);
    }

    async execute(args: string[], client: NapLink, data: OneBotV11.GroupMessageEvent): Promise<void> {
        if (!(await isAdminByData(client, data)) && !isSuperUser(data.user_id)) {
            await reply(client, data, '权限不足，需要管理员或超级管理员权限。');
            return;
        }

        const action = this.resolveAction(args);
        if (action === 'add') {
            await this.handleAdd(args, client, data);
        } else if (action === 'remove') {
            await this.handleRemove(args, client, data);
        } else {
            await this.handleList(client, data);
        }
    }

    private resolveAction(args: string[]): BlacklistAction {
        if (args[0] === 'add' || args[0] === 'remove' || args[0] === 'list') return args[0];
        return 'add';
    }

    private resolveUserId(args: string[]): number {
        return Number(args[0] === 'add' || args[0] === 'remove' ? args[1] : args[0]);
    }

    private resolveReason(args: string[]): string | null {
        const start = args[0] === 'add' ? 2 : 1;
        return args.slice(start).join(' ') || null;
    }

    private async isGroupMember(client: NapLink, groupId: number, userId: number): Promise<boolean> {
        const members = (await client.getGroupMemberList(groupId)) as OneBotV11.GroupMemberInfo[];
        return members.some(member => member.user_id === userId);
    }

    private async handleAdd(args: string[], client: NapLink, data: OneBotV11.GroupMessageEvent): Promise<void> {
        const userId = this.resolveUserId(args);
        const reason = this.resolveReason(args);

        try {
            let isUserInGroup = true;
            if (!(await this.isGroupMember(client, data.group_id, userId))) {
                await reply(client, data, `用户 ${userId} 不在本群，无法拉黑。`);
                isUserInGroup = false;
            }

            await db
                .insert(groupBlacklists)
                .values({
                    groupId: data.group_id,
                    userId,
                    createdBy: data.user_id,
                    createdAt: Date.now(),
                    reason
                })
                .onConflictDoUpdate({
                    target: [groupBlacklists.groupId, groupBlacklists.userId],
                    set: {
                        createdBy: data.user_id,
                        createdAt: Date.now(),
                        reason
                    }
                });
            if (isUserInGroup) {
                await client.setGroupKick(data.group_id, userId, false);
            }
            await reply(client, data, `已将用户 ${userId} 加入本群黑名单。${reason ? `\n原因：${reason}` : ''}`);
        } catch (error) {
            await reply(client, data, `操作失败：${getErrorMessage(error)}`);
        }
    }

    private async handleRemove(args: string[], client: NapLink, data: OneBotV11.GroupMessageEvent): Promise<void> {
        const userId = this.resolveUserId(args);

        try {
            const result = db
                .delete(groupBlacklists)
                .where(and(eq(groupBlacklists.groupId, data.group_id), eq(groupBlacklists.userId, userId)))
                .run();

            if (result.changes > 0) {
                await reply(client, data, `已将用户 ${userId} 移出本群黑名单。`);
            } else {
                await reply(client, data, `用户 ${userId} 不在本群黑名单中。`);
            }
        } catch (error) {
            await reply(client, data, `操作失败：${getErrorMessage(error)}`);
        }
    }

    private async handleList(client: NapLink, data: OneBotV11.GroupMessageEvent): Promise<void> {
        try {
            const records = await db.query.groupBlacklists.findMany({
                where: eq(groupBlacklists.groupId, data.group_id)
            });

            if (records.length === 0) {
                await reply(client, data, '本群黑名单为空。');
                return;
            }

            const lines = records.map((record, index) => {
                const dateText = new Date(record.createdAt).toLocaleString();
                const reasonText = record.reason ? `\n  原因：${record.reason}` : '';
                return `${index + 1}. 用户 ${record.userId}\n  时间：${dateText}${reasonText}`;
            });

            await reply(client, data, `本群黑名单：\n\n${lines.join('\n\n')}`);
        } catch (error) {
            await reply(client, data, `操作失败：${getErrorMessage(error)}`);
        }
    }
}
