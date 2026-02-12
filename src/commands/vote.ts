import { NapLink } from '@naplink/naplink';
import { OneBotV11 } from '@onebots/protocol-onebot-v11/lib';
import { db } from '@/db';
import { pollVotes, polls } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { isSuperUser } from '@/utils/permission';

import { reply } from '@/utils/client';
import { Command, CommandScope } from '@/types';

export class VoteCommand implements Command<OneBotV11.GroupMessageEvent> {
    name = 'vote';
    aliases = ['poll'];
    description = '群投票功能。';
    usage = {
        create: '/vote create <标题> | <选项1> | <选项2> [...更多选项] [| minLevel=10]',
        list: '/vote list',
        show: '/vote show <投票ID>',
        pick: '/vote pick <投票ID> <选项序号>',
        rank: '/vote rank <投票ID>',
        end: '/vote end <投票ID>'
    };
    scope: CommandScope = 'group';

    validateArgs(args: string[]): boolean {
        if (args.length === 0) {
            return false;
        }

        const action = args[0];
        if (!['create', 'list', 'show', 'pick', 'end', 'rank'].includes(action)) {
            return false;
        }
        if (action === 'list' && args.length !== 1) {
            return false;
        }
        if (action === 'create' && args.length < 2) {
            return false;
        }
        if (action === 'show' && (args.length !== 2 || !Number.isInteger(Number(args[1])))) {
            return false;
        }
        if (
            action === 'pick' &&
            (args.length !== 3 || !Number.isInteger(Number(args[1])) || !Number.isInteger(Number(args[2])))
        ) {
            return false;
        }
        if (action === 'end' && (args.length !== 2 || !Number.isInteger(Number(args[1])))) {
            return false;
        }
        return true;
    }

    async execute(args: string[], client: NapLink, data: OneBotV11.GroupMessageEvent): Promise<void> {
        const action = args[0];
        if (action === 'create') {
            if (!isSuperUser(data.user_id)) {
                await reply(client, data, '你没有权限执行此操作。');
                return;
            }
            const payload = args.slice(1).join(' ');
            const parts = payload
                .split('|')
                .map(item => item.trim())
                .filter(Boolean);
            const minLevelIndex = parts.findIndex(part => /^minlevel\s*=\s*\d+$/i.test(part));
            let minLevel = 0;
            let filteredParts = parts;
            if (minLevelIndex !== -1) {
                minLevel = Number(parts[minLevelIndex].match(/\d+/)?.[0] ?? 0);
                filteredParts = parts.filter((_, index) => index !== minLevelIndex);
            }
            if (filteredParts.length < 3) {
                await reply(client, data, '创建失败：至少提供 1 个标题和 2 个选项，使用 | 分割。');
                return;
            }
            const [title, ...options] = filteredParts;
            if (options.length > 30) {
                await reply(client, data, '创建失败：最多支持 30 个选项。');
                return;
            }
            const created = await db
                .insert(polls)
                .values({
                    groupId: data.group_id,
                    creatorId: data.user_id,
                    title,
                    options: JSON.stringify(options),
                    minLevel,
                    createdAt: Date.now()
                })
                .returning();

            await reply(
                client,
                data,
                `投票创建成功。${minLevel > 0 ? `\n最低群等级：${minLevel}` : ''}\nID: ${created[0].id}\n标题: ${title}\n${options.map((option, index) => `${index + 1}. ${option}`).join('\n')}`
            );
            return;
        }

        if (action === 'list') {
            const recent = await db.query.polls.findMany({
                where: (poll, { and, eq }) => and(eq(poll.groupId, data.group_id), eq(poll.isClosed, false)),
                orderBy: (poll, { desc }) => [desc(poll.createdAt)],
                limit: 10
            });
            if (recent.length === 0) {
                await reply(client, data, '当前群没有进行中的投票。');
                return;
            }
            await reply(
                client,
                data,
                `进行中的投票:\n使用 /vote show <ID> 来查看详细选项\n${recent.map(item => `#${item.id} ${item.title} (共 ${JSON.parse(item.options).length} 个选项)`).join('\n')}`
            );
            return;
        }

        if (action === 'show') {
            const pollId = Number(args[1]);
            if (!Number.isInteger(pollId)) {
                await reply(client, data, '请输入正确的投票 ID。');
                return;
            }
            const poll = await db.query.polls.findFirst({
                where: (item, { and, eq }) => and(eq(item.id, pollId), eq(item.groupId, data.group_id))
            });
            if (!poll) {
                await reply(client, data, '未找到该投票。');
                return;
            }
            const options = JSON.parse(poll.options) as string[];
            const votes = await db.query.pollVotes.findMany({
                where: (vote, { eq }) => eq(vote.pollId, pollId)
            });
            const counts = options.map((_, index) => votes.filter(vote => vote.optionIndex === index).length);
            const total = counts.reduce((sum, count) => sum + count, 0);
            await reply(
                client,
                data,
                `投票 #${poll.id}${poll.isClosed ? '（已结束）' : ''}\n标题：${poll.title}\n` +
                    `${poll.isClosed ? '' : '使用 /vote pick <ID> <选项序号> 来投票\n'}` +
                    `${poll.minLevel > 0 ? `最低群等级：${poll.minLevel}\n` : ''}` +
                    `${options.map((option, index) => `${index + 1}. ${option} - ${counts[index]}票`).join('\n')}\n` +
                    `总票数：${total}`
            );
            return;
        }

        if (action === 'pick') {
            const pollId = Number(args[1]);
            const optionNumber = Number(args[2]);
            if (!Number.isInteger(pollId) || !Number.isInteger(optionNumber)) {
                await reply(client, data, '用法：/vote pick <投票ID> <选项序号>');
                return;
            }
            const poll = await db.query.polls.findFirst({
                where: (item, { and, eq }) => and(eq(item.id, pollId), eq(item.groupId, data.group_id))
            });
            if (!poll) {
                await reply(client, data, '投票不存在。');
                return;
            }
            if (poll.isClosed) {
                await reply(client, data, '该投票已结束。');
                return;
            }
            const userLevelRaw = Number((await client.getGroupMemberInfo(data.group_id, data.user_id) as OneBotV11.GroupMemberInfo).level ?? 0);
            const userLevel = Number.isFinite(userLevelRaw) ? userLevelRaw : 0;
            if (poll.minLevel > 0 && userLevel < poll.minLevel) {
                await reply(client, data, `你的群等级不足，最低要求：${poll.minLevel}，你的等级：${userLevel}。`);
                return;
            }
            const options = JSON.parse(poll.options) as string[];
            const optionIndex = optionNumber - 1;
            if (optionIndex < 0 || optionIndex >= options.length) {
                await reply(client, data, '选项序号超出范围。');
                return;
            }

            const existingVote = await db.query.pollVotes.findFirst({
                where: (vote, { and, eq }) =>
                    and(eq(vote.pollId, pollId), eq(vote.groupId, data.group_id), eq(vote.userId, data.user_id))
            });
            if (existingVote) {
                await db
                    .update(pollVotes)
                    .set({ optionIndex, updatedAt: Date.now() })
                    .where(eq(pollVotes.id, existingVote.id));
            } else {
                await db.insert(pollVotes).values({
                    pollId,
                    groupId: data.group_id,
                    userId: data.user_id,
                    optionIndex,
                    updatedAt: Date.now()
                });
            }

            await reply(client, data, `投票成功，你选择了：${options[optionIndex]}`);
            return;
        }

        if (action === 'rank') {
            const pollId = Number(args[1]);
            if (!Number.isInteger(pollId)) {
                await reply(client, data, '请输入正确的投票 ID。');
                return;
            }
            const poll = await db.query.polls.findFirst({
                where: (item, { and, eq }) => and(eq(item.id, pollId), eq(item.groupId, data.group_id))
            });
            if (!poll) {
                await reply(client, data, '投票不存在。');
                return;
            }
            const options = JSON.parse(poll.options) as string[];
            const votes = await db.query.pollVotes.findMany({
                where: (vote, { eq }) => eq(vote.pollId, pollId)
            });
            const counts = options.map((_, index) => votes.filter(vote => vote.optionIndex === index).length);
            const rankedOptions = options
                .map((option, index) => ({ option, count: counts[index], id: index + 1 }))
                .sort((a, b) => b.count - a.count);
            await reply(
                client,
                data,
                `投票 #${poll.id} 选项排名：\n` +
                    `${poll.minLevel > 0 ? `最低群等级：${poll.minLevel}\n` : ''}` +
                    rankedOptions
                        .map((item, index) => `${index + 1}(ID: ${item.id}). ${item.option} - ${item.count}票`)
                        .join('\n')
            );
            return;
        }

        if (action === 'end') {
            const pollId = Number(args[1]);
            if (!Number.isInteger(pollId)) {
                await reply(client, data, '请输入正确的投票 ID。');
                return;
            }
            const poll = await db.query.polls.findFirst({
                where: (item, { and, eq }) => and(eq(item.id, pollId), eq(item.groupId, data.group_id))
            });
            if (!poll) {
                await reply(client, data, '投票不存在。');
                return;
            }
            if (poll.creatorId !== data.user_id && !isSuperUser(data.user_id)) {
                await reply(client, data, '你没有权限执行此操作。');
                return;
            }

            await db.update(polls).set({ isClosed: true, closedAt: Date.now() }).where(eq(polls.id, pollId));
            await reply(client, data, `投票 #${pollId} 已结束。使用 /vote show ${pollId} 查看结果。`);
            return;
        }

        await reply(client, data, '未知子命令。');
    }
}
