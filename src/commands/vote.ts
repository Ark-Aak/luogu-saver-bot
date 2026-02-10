import { Command, CommandScope, resolveCommandUsage } from '.';
import { NapLink } from '@naplink/naplink';
import { OneBotV11 } from '@onebots/protocol-onebot-v11/lib';
import { MessageBuilder } from '@/utils/message-builder';
import { db } from '@/db';
import { pollVotes, polls } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { isSuperUser } from '@/utils/permission';
import { getTargetId, sendAutoMessage } from '@/utils/client';

export class VoteCommand implements Command<OneBotV11.GroupMessageEvent> {
    name = 'vote';
    aliases = ['poll'];
    description = '群投票功能。';
    usage = {
        create: '/vote create <标题> | <选项1> | <选项2> [...更多选项]',
        list: '/vote list',
        show: '/vote show <投票ID>',
        pick: '/vote pick <投票ID> <选项序号>',
        end: '/vote end <投票ID>',
    };
    scope: CommandScope = 'group';

    async validateArgs(args: string[], client: NapLink, data: OneBotV11.GroupMessageEvent): Promise<boolean | 'replied'> {
        const usage = resolveCommandUsage(this, args[0]);
        const sendUsage = async (text: string) => {
            const msg = new MessageBuilder()
                .reply(data.message_id)
                .atIf(true, data.user_id)
                .text(`${text}\n用法：\n${usage}`)
                .build();
            await sendAutoMessage(client, false, getTargetId(data), msg);
        };

        if (args.length === 0) {
            await sendUsage('参数不足。');
            return 'replied';
        }

        const action = args[0];
        if (!['create', 'list', 'show', 'pick', 'end'].includes(action)) {
            await sendUsage('未知子命令。');
            return 'replied';
        }
        if (action === 'list' && args.length !== 1) {
            await sendUsage('list 不接受额外参数。');
            return 'replied';
        }
        if (action === 'create' && args.length < 2) {
            await sendUsage('create 需要投票描述。');
            return 'replied';
        }
        if (action === 'show' && (args.length !== 2 || !Number.isInteger(Number(args[1])))) {
            await sendUsage('show 需要正确的投票 ID。');
            return 'replied';
        }
        if (action === 'pick' && (args.length !== 3 || !Number.isInteger(Number(args[1])) || !Number.isInteger(Number(args[2])))) {
            await sendUsage('pick 需要正确的投票 ID 和选项序号。');
            return 'replied';
        }
        if (action === 'end' && (args.length !== 2 || !Number.isInteger(Number(args[1])))) {
            await sendUsage('end 需要正确的投票 ID。');
            return 'replied';
        }
        return true;
    }

    async execute(args: string[], client: NapLink, data: OneBotV11.GroupMessageEvent): Promise<void> {
        const reply = async (text: string) => {
            const msg = new MessageBuilder()
                .reply(data.message_id)
                .atIf(true, data.user_id)
                .text(text)
                .build();
            await sendAutoMessage(client, false, getTargetId(data), msg);
        };

        const action = args[0];
        if (action === 'create') {
            const payload = args.slice(1).join(' ');
            const parts = payload.split('|').map(item => item.trim()).filter(Boolean);
            if (parts.length < 3) {
                await reply('创建失败：至少提供 1 个标题和 2 个选项，使用 | 分割。');
                return;
            }
            const [title, ...options] = parts;
            if (options.length > 30) {
                await reply('创建失败：最多支持 30 个选项。');
                return;
            }
            const created = await db.insert(polls).values({
                groupId: data.group_id,
                creatorId: data.user_id,
                title,
                options: JSON.stringify(options),
                createdAt: Date.now(),
            }).returning();

            await reply(`投票创建成功。\nID: ${created[0].id}\n标题: ${title}\n${options.map((option, index) => `${index + 1}. ${option}`).join('\n')}`);
            return;
        }

        if (action === 'list') {
            const recent = await db.query.polls.findMany({
                where: (poll, { and, eq }) => and(eq(poll.groupId, data.group_id), eq(poll.isClosed, false)),
                orderBy: (poll, { desc }) => [desc(poll.createdAt)],
                limit: 10,
            });
            if (recent.length === 0) {
                await reply('当前群没有进行中的投票。');
                return;
            }
            await reply(`进行中的投票:\n使用 /vote show <ID> 来查看详细选项\n${recent.map(item => `#${item.id} ${item.title} (共 ${item.options.length} 个选项)`).join('\n')}`);
            return;
        }

        if (action === 'show') {
            const pollId = Number(args[1]);
            if (!Number.isInteger(pollId)) {
                await reply('请输入正确的投票 ID。');
                return;
            }
            const poll = await db.query.polls.findFirst({
                where: (item, { and, eq }) => and(eq(item.id, pollId), eq(item.groupId, data.group_id))
            });
            if (!poll) {
                await reply('未找到该投票。');
                return;
            }
            const options = JSON.parse(poll.options) as string[];
            const votes = await db.query.pollVotes.findMany({ where: (vote, { eq }) => eq(vote.pollId, pollId) });
            const counts = options.map((_, index) => votes.filter(vote => vote.optionIndex === index).length);
            const total = counts.reduce((sum, count) => sum + count, 0);
            await reply(
                `投票 #${poll.id}${poll.isClosed ? '（已结束）' : ''}\n标题：${poll.title}\n` +
                `${options.map((option, index) => `${index + 1}. ${option} - ${counts[index]}票`).join('\n')}\n` +
                `总票数：${total}`
            );
            return;
        }

        if (action === 'pick') {
            const pollId = Number(args[1]);
            const optionNumber = Number(args[2]);
            if (!Number.isInteger(pollId) || !Number.isInteger(optionNumber)) {
                await reply('用法：/vote pick <投票ID> <选项序号>');
                return;
            }
            const poll = await db.query.polls.findFirst({
                where: (item, { and, eq }) => and(eq(item.id, pollId), eq(item.groupId, data.group_id))
            });
            if (!poll) {
                await reply('投票不存在。');
                return;
            }
            if (poll.isClosed) {
                await reply('该投票已结束。');
                return;
            }
            const options = JSON.parse(poll.options) as string[];
            const optionIndex = optionNumber - 1;
            if (optionIndex < 0 || optionIndex >= options.length) {
                await reply('选项序号超出范围。');
                return;
            }

            const existingVote = await db.query.pollVotes.findFirst({
                where: (vote, { and, eq }) => and(eq(vote.pollId, pollId), eq(vote.groupId, data.group_id), eq(vote.userId, data.user_id))
            });
            if (existingVote) {
                await db.update(pollVotes).set({ optionIndex, updatedAt: Date.now() }).where(eq(pollVotes.id, existingVote.id));
            }
            else {
                await db.insert(pollVotes).values({
                    pollId,
                    groupId: data.group_id,
                    userId: data.user_id,
                    optionIndex,
                    updatedAt: Date.now(),
                });
            }

            await reply(`投票成功，你选择了：${options[optionIndex]}`);
            return;
        }

        if (action === 'end') {
            const pollId = Number(args[1]);
            if (!Number.isInteger(pollId)) {
                await reply('请输入正确的投票 ID。');
                return;
            }
            const poll = await db.query.polls.findFirst({
                where: (item, { and, eq }) => and(eq(item.id, pollId), eq(item.groupId, data.group_id))
            });
            if (!poll) {
                await reply('投票不存在。');
                return;
            }
            if (poll.creatorId !== data.user_id && !isSuperUser(data.user_id)) {
                await reply('只有发起人或超级管理员可以结束投票。');
                return;
            }

            await db.update(polls).set({ isClosed: true, closedAt: Date.now() }).where(eq(polls.id, pollId));
            await reply(`投票 #${pollId} 已结束。使用 /vote show ${pollId} 查看结果。`);
            return;
        }

        await reply('未知子命令。');
    }
}
