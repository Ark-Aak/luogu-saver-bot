import { NapLink } from '@naplink/naplink';
import { OneBotV11 } from '@onebots/protocol-onebot-v11/lib';
import { and, eq } from 'drizzle-orm';
import { Command, CommandScope } from '@/types';
import { reply, sendPrivateMessage } from '@/utils/client';
import { isSuperUser } from '@/utils/permission';
import { db } from '@/db';
import { rechargeDailyUsages } from '@/db/schema';
import { config } from '@/config';
import { createRedemptionCodeByAdmin } from '@/utils/newapi';
import { isValidUser } from '@/utils/validator';
import { normalizeConditionalUserTargets } from '@/utils/command-args';
import { getErrorMessage } from '@/utils/error';

import { getRandomHexString } from '@/utils/random';

const MONEY_REGEX = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;

function toCents(usd: number): number {
    return Math.round(usd * 100);
}

function fromCents(cents: number): string {
    return (cents / 100).toFixed(2);
}

function getCurrentDayKey(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: config.saver.dailyLimitTimezone }).format(new Date());
}

export class RechargeCommand implements Command<OneBotV11.PrivateMessageEvent> {
    name = 'recharge';
    aliases = ['充值'];
    description = '私聊生成充值兑换码（普通用户每日最多 $5）。可指定目标用户，私信发送给对方。';
    usage = '/recharge <金额> [@用户/QQ号]';
    scope: CommandScope = 'both';
    normalizeArgs = normalizeConditionalUserTargets(args => args.length >= 2, 1);

    validateArgs(args: string[]): boolean {
        if (args.length === 1) return MONEY_REGEX.test(args[0]);
        if (args.length === 2) return MONEY_REGEX.test(args[0]) && isValidUser(args[1]);
        return false;
    }

    async execute(args: string[], client: NapLink, data: OneBotV11.PrivateMessageEvent): Promise<void> {
        const targetUserId = args.length >= 2 ? Number(args[1]) : null;

        if ((!targetUserId || targetUserId === data.user_id) && (data as any).message_type === 'group') {
            await reply(client, data, '请私聊机器人发送该命令，或指定目标用户：/recharge <金额> <QQ号>');
            return;
        }

        const amountUsd = Number(args[0]);
        if (!Number.isFinite(amountUsd) || amountUsd < 1) {
            await reply(client, data, '金额必须是大于等于 1 的数字，最多保留两位小数。');
            return;
        }

        const amountCents = toCents(amountUsd);
        const callerIsSuperUser = isSuperUser(data.user_id);
        const callerId = data.user_id;

        const today = getCurrentDayKey();
        const dailyLimitCents = toCents(config.saver.selfRechargeDailyLimitUsd);
        const existingUsage = await db.query.rechargeDailyUsages.findFirst({
            where: and(eq(rechargeDailyUsages.userId, callerId), eq(rechargeDailyUsages.dayKey, today))
        });

        const usedCents = existingUsage?.amountCents ?? 0;

        if (!callerIsSuperUser) {
            if (usedCents + amountCents > dailyLimitCents) {
                const remain = Math.max(0, dailyLimitCents - usedCents);
                await reply(
                    client,
                    data,
                    `你今日自助充值额度不足。\n今日已用: $${fromCents(usedCents)}。\n今日剩余: $${fromCents(remain)}。\n超过 $${config.saver.selfRechargeDailyLimitUsd.toFixed(2)} 的部分请联系管理员充值。`
                );
                return;
            }
        }

        let redemptionCode: string;
        try {
            redemptionCode = await createRedemptionCodeByAdmin(
                amountUsd,
                `${data.user_id}-${getRandomHexString(10)}-${fromCents(amountCents)}`
            );
        } catch (error) {
            await reply(client, data, `充值失败：${getErrorMessage(error)}`);
            return;
        }

        try {
            if (!callerIsSuperUser) {
                await db
                    .insert(rechargeDailyUsages)
                    .values({
                        userId: callerId,
                        dayKey: today,
                        amountCents,
                        updatedAt: Date.now()
                    })
                    .onConflictDoUpdate({
                        target: [rechargeDailyUsages.userId, rechargeDailyUsages.dayKey],
                        set: {
                            amountCents: usedCents + amountCents,
                            updatedAt: Date.now()
                        }
                    });
            }

            const codeMessage = [
                '你的充值兑换码已生成。',
                `金额: $${fromCents(amountCents)}。`,
                `兑换码: ${redemptionCode}。`,
                '请尽快前往 NewAPI 使用。',
                '地址: https://ai.luogu.me/console/topup',
                '--------------------',
                '欢迎使用群主雨云推广购买服务器！',
                '推广链接：https://www.rainyun.com/federico_?s=bot',
                '绑定微信即送专属五折优惠！更多优惠可以私信商量！',
                '购买服务器即提供永久免费技术支持！'
            ].join('\n');

            if (targetUserId) {
                try {
                    await sendPrivateMessage(client, targetUserId, codeMessage);
                } catch {
                    await reply(client, data, '兑换码已生成但未送达，请尝试让对方添加机器人好友后重试。');
                    return;
                }
                await reply(client, data, `已将 $${fromCents(amountCents)} 的充值兑换码私信发送给 ${targetUserId}。`);
            } else {
                await reply(client, data, codeMessage);
            }
        } catch (error) {
            await reply(client, data, `充值失败：${getErrorMessage(error)}`);
        }
    }
}
