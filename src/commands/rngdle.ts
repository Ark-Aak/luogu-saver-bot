import { NapLink } from '@naplink/naplink';
import { OneBotV11 } from '@onebots/protocol-onebot-v11/lib';
import { AllMessageEvent, Command, CommandScope } from '@/types';
import { normalizeUserTargets } from '@/utils/command-args';
import { isGroup, reply } from '@/utils/client';
import { getLocalDayKey } from '@/utils/rngdle/daily';
import { RARITY_DETAILS } from '@/utils/rngdle/analyzer';
import {
    formatBadge,
    formatEp,
    formatNextRollLine,
    formatRngdleDetail,
    formatRngdleShare
} from '@/utils/rngdle/format';
import {
    clearTodayRngdleRollForReroll,
    getOrCreateTodayRngdleRoll,
    getTodayRngdleRolls,
    getUserRngdleRolls,
    getUserRngdleSummary,
    RngdleRollRecord
} from '@/utils/rngdle/storage';
import { isSuperUser } from '@/utils/permission';
import { isValidUser } from '@/utils/validator';

type RngdleAction = 'roll' | 'detail' | 'rank' | 'history' | 'stats' | 'reroll';

type GroupMemberLike = OneBotV11.GroupMemberInfo & {
    card?: string;
    nickname?: string;
};

const PAGE_SIZE = 7;

export class RngdleCommand implements Command<AllMessageEvent> {
    name = 'rngdle';
    aliases = ['rng', '随机数'];
    description = '每日随机数、EP 和 badge 收集小游戏。';
    usage = {
        roll: '/rngdle',
        detail: '/rngdle detail',
        rank: '/rngdle rank',
        history: '/rngdle history [页码]',
        stats: '/rngdle stats',
        reroll: '/rngdle reroll <QQ号/@用户>'
    };
    scope: CommandScope = 'both';

    normalizeArgs(args: string[]): string[] | null {
        if (['reroll', '重投'].includes(args[0])) {
            return normalizeUserTargets(1)(args);
        }
        return args;
    }

    validateArgs(args: string[]): boolean {
        if (args.length === 0) return true;

        const action = this.resolveAction(args[0]);
        if (!action) return false;
        if (action === 'history') {
            return (
                args.length <= 2 && (args.length === 1 || (Number.isInteger(Number(args[1])) && Number(args[1]) >= 1))
            );
        }
        if (action === 'reroll') {
            return args.length === 2 && isValidUser(args[1]);
        }
        return args.length === 1;
    }

    async execute(args: string[], client: NapLink, data: AllMessageEvent): Promise<void> {
        const action = args.length === 0 ? 'roll' : this.resolveAction(args[0]);

        if (action === 'reroll') {
            await this.handleReroll(args, client, data);
            return;
        }

        if (action === 'detail') {
            await this.handleDetail(client, data);
            return;
        }
        if (action === 'rank') {
            await this.handleRank(client, data);
            return;
        }
        if (action === 'history') {
            await this.handleHistory(args, client, data);
            return;
        }
        if (action === 'stats') {
            await this.handleStats(client, data);
            return;
        }
        await this.handleRoll(client, data);
    }

    private resolveAction(raw: string): RngdleAction | null {
        const normalized = raw.toLowerCase();
        if (['detail', 'details', '详情'].includes(normalized)) return 'detail';
        if (['rank', 'ranking', '排行', '排名'].includes(normalized)) return 'rank';
        if (['history', 'hist', '历史'].includes(normalized)) return 'history';
        if (['stats', 'stat', '统计'].includes(normalized)) return 'stats';
        if (['reroll', '重投'].includes(normalized)) return 'reroll';
        if (['roll', '今日'].includes(normalized)) return 'roll';
        return null;
    }

    private async handleRoll(client: NapLink, data: AllMessageEvent): Promise<void> {
        const record = await getOrCreateTodayRngdleRoll(data.user_id);
        const summary = await getUserRngdleSummary(data.user_id);
        await reply(client, data, formatRngdleShare(record, summary.totalEp));
    }

    private async handleDetail(client: NapLink, data: AllMessageEvent): Promise<void> {
        const record = await getOrCreateTodayRngdleRoll(data.user_id);
        const summary = await getUserRngdleSummary(data.user_id);
        await reply(client, data, formatRngdleDetail(record, summary.totalEp));
    }

    private async handleRank(client: NapLink, data: AllMessageEvent): Promise<void> {
        if (!isGroup(data)) {
            await reply(client, data, '/rngdle rank 只能在群聊中使用。');
            return;
        }

        const dayKey = getLocalDayKey();
        const members = (await client.getGroupMemberList(data.group_id)) as GroupMemberLike[];
        const memberMap = new Map(members.map(member => [member.user_id, member]));
        const ranked = (await getTodayRngdleRolls(dayKey))
            .filter(record => memberMap.has(record.userId))
            .sort((a, b) => b.totalEp - a.totalEp || a.roll - b.roll || a.userId - b.userId);

        if (ranked.length === 0) {
            await reply(
                client,
                data,
                `RNGdle Daily Rank 🎲\n\n今天本群还没有人 roll 过。\n使用 /rngdle 开始今日 RNGdle。`
            );
            return;
        }

        const topLines = ranked.slice(0, 10).map((record, index) => this.formatRankLine(record, memberMap, index + 1));
        const myIndex = ranked.findIndex(record => record.userId === data.user_id);
        const myLines =
            myIndex >= 0
                ? [
                      '',
                      `你的排名：#${myIndex + 1} / ${ranked.length}`,
                      `你的结果：${ranked[myIndex].rollText} · ${formatEp(ranked[myIndex].totalEp)} EP`
                  ]
                : ['', `你今天还没有 roll。使用 /rngdle 生成今日结果后会进入本群排行榜。`];

        await reply(
            client,
            data,
            ['RNGdle Daily Rank 🎲', '', ...topLines, ...myLines, formatNextRollLine()].join('\n')
        );
    }

    private async handleHistory(args: string[], client: NapLink, data: AllMessageEvent): Promise<void> {
        const page = args.length >= 2 ? Number(args[1]) : 1;
        const records = await getUserRngdleRolls(data.user_id);

        if (records.length === 0) {
            await reply(client, data, '还没有 RNGdle 历史记录。使用 /rngdle 生成今日结果。');
            return;
        }

        const totalPages = Math.max(1, Math.ceil(records.length / PAGE_SIZE));
        if (page > totalPages) {
            await reply(client, data, `页码超出范围，共 ${totalPages} 页。`);
            return;
        }

        const start = (page - 1) * PAGE_SIZE;
        const pageRecords = records.slice(start, start + PAGE_SIZE);
        const lines = pageRecords.map((record, index) => {
            const rarity = RARITY_DETAILS[record.rarity];
            return `${start + index + 1}. ${record.dayKey} · ${record.rollText} · ${formatEp(record.totalEp)} EP · ${rarity.emoji} ${rarity.label} · ${record.percentileText}`;
        });
        const summary = await getUserRngdleSummary(data.user_id);

        await reply(
            client,
            data,
            [
                `RNGdle History 🎲 (${page}/${totalPages})`,
                '',
                ...lines,
                '',
                `Lifetime EP: ${formatEp(summary.totalEp)}`
            ].join('\n')
        );
    }

    private async handleStats(client: NapLink, data: AllMessageEvent): Promise<void> {
        const summary = await getUserRngdleSummary(data.user_id);
        if (summary.days === 0) {
            await reply(client, data, '还没有 RNGdle 统计数据。使用 /rngdle 生成今日结果。');
            return;
        }

        const best = summary.bestRoll;
        const bestLine = best
            ? `${best.dayKey} · ${best.rollText} · ${formatEp(best.totalEp)} EP · ${RARITY_DETAILS[best.rarity].emoji} ${RARITY_DETAILS[best.rarity].label} · ${best.percentileText}`
            : 'None';
        const averageEp = Math.round(summary.totalEp / summary.days);

        await reply(
            client,
            data,
            [
                'RNGdle Stats 🎲',
                '',
                `游玩天数：${summary.days}`,
                `Lifetime EP: ${formatEp(summary.totalEp)}`,
                `平均 EP: ${formatEp(averageEp)}`,
                `最高单日：${bestLine}`,
                `最高稀有度：${RARITY_DETAILS[summary.highestRarity].emoji} ${RARITY_DETAILS[summary.highestRarity].label}`,
                `已收集 Badge: ${summary.uniqueBadgeCount}`
            ].join('\n')
        );
    }

    private async handleReroll(args: string[], client: NapLink, data: AllMessageEvent): Promise<void> {
        if (!isSuperUser(data.user_id)) {
            await reply(client, data, '权限不足，只有超级管理员可以强制重投 RNGdle。');
            return;
        }

        const targetUserId = Number(args[1]);
        const result = await clearTodayRngdleRollForReroll(targetUserId, data.user_id);
        if (!result.cleared || !result.previous) {
            await reply(client, data, `用户 ${targetUserId} 今天还没有 RNGdle 结果，无需清除。`);
            return;
        }

        const summary = await getUserRngdleSummary(targetUserId);
        const previousText = `${result.previous.rollText} · ${formatEp(result.previous.totalEp)} EP · ${RARITY_DETAILS[result.previous.rarity].emoji} ${RARITY_DETAILS[result.previous.rarity].label} · ${result.previous.percentileText}`;

        await reply(
            client,
            data,
            [
                `已清除用户 ${targetUserId} 的今日 RNGdle 结果。`,
                `旧结果：${previousText}`,
                `重投序号：${result.rerollIndex}`,
                `清除后 Lifetime EP: ${formatEp(summary.totalEp)}`,
                '需要该用户自己再次使用 /rngdle 才会生成新的今日记录。'
            ].join('\n')
        );
    }

    private formatRankLine(record: RngdleRollRecord, memberMap: Map<number, GroupMemberLike>, rank: number): string {
        const member = memberMap.get(record.userId);
        const name = this.formatMemberName(record.userId, member);
        const rarity = RARITY_DETAILS[record.rarity];
        const topBadge = record.scoringBadges[0] ? ` · ${formatBadge(record.scoringBadges[0])}` : '';
        return `${rank}. ${name} · ${record.rollText} · ${formatEp(record.totalEp)} EP · ${rarity.emoji} ${record.percentileText}${topBadge}`;
    }

    private formatMemberName(userId: number, member?: GroupMemberLike): string {
        const rawName = member?.card || member?.nickname || '';
        const name = rawName.replace(/\s+/g, ' ').trim();
        if (!name) return String(userId);
        const clipped = name.length > 16 ? `${name.slice(0, 16)}...` : name;
        return `${clipped}(${userId})`;
    }
}
