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
import { logger } from '@/utils/logger';
import { getRandomHexString } from "@/utils/random";

const MONEY_REGEX = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;
const USER_ID_REGEX = /^[1-9]\d*$/;

function toCents(usd: number): number {
    return Math.round(usd * 100);
}

function fromCents(cents: number): string {
    return (cents / 100).toFixed(2);
}

function getCurrentDayKey(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: config.saver.dailyLimitTimezone }).format(new Date());
}

export class RechargeCommand implements Command<OneBotV11.GroupMessageEvent> {
    name = 'recharge';
    aliases = ['充值'];
    description = '在群内生成充值兑换码并私信发送（普通用户每日最多 $5）。';
    usage = '/recharge <金额>';
    scope: CommandScope = 'group';

    validateArgs(args: string[]): boolean {
        return args.length === 1 && MONEY_REGEX.test(args[0]);
    }

    async execute(args: string[], client: NapLink, data: OneBotV11.GroupMessageEvent): Promise<void> {
        const amountUsd = Number(args[0]);
        if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
            await reply(client, data, '金额必须是大于 0 的数字，最多保留两位小数。');
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
            await reply(client, data, `充值失败：${error instanceof Error ? error.message : '未知错误'}`);
            return;
        }

        try {
            await sendPrivateMessage(
                client,
                data.user_id,
                [
                    '你申请的充值兑换码已生成。',
                    `金额: $${fromCents(amountCents)}。`,
                    `兑换码: ${redemptionCode}。`,
                    '请尽快前往 NewAPI 使用。',
                    '地址: https://ai.luogu.me/console/topup'
                ].join('\n'),
                true
            );
        } catch (error) {
            logger.error('Failed to deliver redemption code via private message after code generation.', {
                groupId: data.group_id,
                callerQq: data.user_id,
                amountUsd: fromCents(amountCents),
                redemptionCode,
                error
            });

            await reply(client, data, '兑换码已生成但未送达，请尝试添加机器人好友或联系管理员。');
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

            await reply(
                client,
                data,
                `兑换码已私信发送。金额 $${fromCents(amountCents)}。`
            );
        } catch (error) {
            await reply(client, data, `充值失败：${error instanceof Error ? error.message : '未知错误'}`);
        }
    }
}

