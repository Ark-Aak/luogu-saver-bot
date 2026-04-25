import { NapLink } from '@naplink/naplink';
import { OneBotV11 } from '@onebots/protocol-onebot-v11/lib';
import { eq } from 'drizzle-orm';
import { AllMessageEvent, Command, CommandScope } from '@/types';
import { reply } from '@/utils/client';
import { db } from '@/db';
import { newApiBindings } from '@/db/schema';
import {
    createNewApiUserSubscription,
    deleteNewApiUserSubscription,
    formatNewApiModels,
    formatNewApiPlans,
    formatNewApiSubscriptions,
    formatNewApiUserInfo,
    getNewApiEnabledModels,
    getNewApiPlans,
    getNewApiUserInfo,
    getNewApiUserSubscriptions,
    invalidateNewApiUserSubscription
} from '@/utils/newapi';
import { isSuperUser } from '@/utils/permission';
import { sendEmail } from '@/utils/resend';
import { getUserId } from '@/utils/cqcode';
import { isValidPositiveId, isValidUser, isValidVerificationCode } from '@/utils/validator';
import { config } from '@/config';
import { maskEmail } from '@/utils/email';

type NewApiVerification = {
    newApiUserId: number;
    email: string;
    code: string;
};

export class NewApiCommand implements Command<AllMessageEvent> {
    name = 'newapi';
    aliases = ['额度'];
    description = '绑定 NewAPI 用户 ID 并查询额度。';
    usage = {
        bind: '/newapi bind <NewAPI 用户 ID>',
        verify: '/newapi verify <6 位验证码>',
        models: '/newapi models',
        user: {
            query: '/newapi user query [NewAPI 用户 ID/QQ 号/@用户]'
        },
        plan: {
            list: '/newapi plan list',
            query: '/newapi plan query [NewAPI 用户 ID/QQ 号/@用户]',
            add: '/newapi plan add <NewAPI 用户 ID/@用户> <套餐 ID>',
            delete: '/newapi plan delete <订阅 ID>',
            revoke: '/newapi plan revoke <订阅 ID>'
        }
    };
    scope: CommandScope = 'both';

    private verificationCode = new Map<number, NewApiVerification>();
    private lastSendTime = new Map<number, number>();

    validateArgs(args: string[]): boolean {
        if (args.length === 1 && args[0] === 'models') return true;
        if (args.length === 2 && args[0] === 'bind') return isValidPositiveId(args[1]);
        if (args.length === 2 && args[0] === 'verify') return isValidVerificationCode(args[1]);
        if (args.length === 2 && args[0] === 'user' && args[1] === 'query') return true;
        if (args.length === 3 && args[0] === 'user' && args[1] === 'query') return isValidUser(args[2]);
        if (args.length === 2 && args[0] === 'plan' && ['list', 'query'].includes(args[1])) return true;
        if (args.length === 3 && args[0] === 'plan' && args[1] === 'query') return isValidUser(args[2]);
        if (args.length === 3 && args[0] === 'plan' && ['delete', 'revoke'].includes(args[1])) {
            return isValidPositiveId(args[2]);
        }
        if (args.length === 4 && args[0] === 'plan' && args[1] === 'add') {
            return isValidUser(args[2]) && isValidPositiveId(args[3]);
        }
        return false;
    }

    async execute(
        args: string[],
        client: NapLink,
        data: OneBotV11.GroupMessageEvent | OneBotV11.PrivateMessageEvent
    ): Promise<void> {
        if (args[0] === 'bind') {
            await this.handleBind(Number(args[1]), client, data);
            return;
        }

        if (args[0] === 'verify') {
            await this.handleVerify(args[1], client, data);
            return;
        }

        if (args[0] === 'models') {
            await this.handleModels(client, data);
            return;
        }

        if (args[0] === 'user') {
            await this.handleUser(args.slice(1), client, data);
            return;
        }

        if (args[0] === 'plan') {
            await this.handlePlan(args.slice(1), client, data);
            return;
        }

        await this.handleUser(['query'], client, data);
    }

    private async getBinding(data: AllMessageEvent) {
        return this.getBindingByUserId(data.user_id);
    }

    private async getBindingByUserId(userId: number) {
        return db.query.newApiBindings.findFirst({
            where: eq(newApiBindings.userId, userId)
        });
    }

    private async requireSuperUser(client: NapLink, data: AllMessageEvent): Promise<boolean> {
        if (isSuperUser(data.user_id)) return true;
        await reply(client, data, '权限不足，需要超级管理员权限。');
        return false;
    }

    private generateVerificationCode(data: AllMessageEvent, newApiUserId: number, email: string): string {
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        this.verificationCode.set(data.user_id, { newApiUserId, email, code });
        setTimeout(() => this.verificationCode.delete(data.user_id), config.email.verificationExpireMs);
        return code;
    }

    private async handleBind(newApiUserId: number, client: NapLink, data: AllMessageEvent): Promise<void> {
        try {
            const info = await getNewApiUserInfo(newApiUserId);

            if (!info.email) {
                await reply(
                    client,
                    data,
                    '这个 NewAPI 用户还没有绑定邮箱，请先前往 https://ai.luogu.me/console/personal 绑定邮箱后再试。'
                );
                return;
            }

            const now = Date.now();
            const lastTime = this.lastSendTime.get(data.user_id) || 0;
            if (now - lastTime < config.email.verificationCooldownMs) {
                await reply(client, data, '请勿频繁发送验证码，稍后再试。');
                return;
            }

            const code = this.generateVerificationCode(data, newApiUserId, info.email);
            this.lastSendTime.set(data.user_id, now);

            const result = await sendEmail({
                to: info.email,
                subject: 'LGS-Bot NewAPI 绑定验证码',
                text: `您的 LGS-Bot NewAPI 绑定验证码是：${code}。该验证码有效期为 10 分钟，请尽快使用。`,
                html: `<p>您的 LGS-Bot NewAPI 绑定验证码是：<strong>${code}</strong>。</p><p>该验证码有效期为 10 分钟，请尽快使用。</p>`
            });

            if (!result.success) {
                throw new Error('验证码邮件发送失败，请稍后再试。');
            }

            await reply(
                client,
                data,
                `验证码已发送至 ${maskEmail(info.email)}。\n请查收并使用 /newapi verify <验证码> 完成绑定。\n验证码有效期为 10 分钟。`
            );
        } catch (error) {
            await reply(client, data, `绑定失败：${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    private async handleVerify(code: string, client: NapLink, data: AllMessageEvent): Promise<void> {
        const verification = this.verificationCode.get(data.user_id);
        if (!verification || verification.code !== code) {
            await reply(client, data, '验证码错误或已过期，请重新使用 /newapi bind <NewAPI用户ID> 获取验证码。');
            return;
        }

        try {
            await db
                .insert(newApiBindings)
                .values({
                    userId: data.user_id,
                    newApiUserId: verification.newApiUserId,
                    updatedAt: Date.now()
                })
                .onConflictDoUpdate({
                    target: newApiBindings.userId,
                    set: {
                        newApiUserId: verification.newApiUserId,
                        updatedAt: Date.now()
                    }
                });

            this.verificationCode.delete(data.user_id);
            await reply(client, data, `已绑定 NewAPI 用户 ID: ${verification.newApiUserId}。`);
        } catch (error) {
            await reply(client, data, `验证失败：${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    private async resolveQueryNewApiUserId(
        target: string | undefined,
        client: NapLink,
        data: AllMessageEvent,
        action: string
    ): Promise<number | null> {
        if (!target) {
            const binding = await this.getBinding(data);
            if (!binding) {
                await reply(client, data, '你还没有绑定 NewAPI 用户 ID，请先使用 /newapi bind <NewAPI用户ID>。');
                return null;
            }
            return binding.newApiUserId;
        }

        if (!(await this.requireSuperUser(client, data))) return null;

        const targetUserId = getUserId(target);
        if (!targetUserId) {
            await reply(client, data, '目标用户无效，请使用 NewAPI 用户 ID、QQ 号或 @用户。');
            return null;
        }

        if (isValidPositiveId(target)) {
            return Number(target);
        }

        const binding = await this.getBindingByUserId(targetUserId);
        if (!binding) {
            await reply(client, data, `用户 ${targetUserId} 还没有绑定 NewAPI 用户 ID，无法${action}。`);
            return null;
        }

        return binding.newApiUserId;
    }

    private async handleUser(args: string[], client: NapLink, data: AllMessageEvent): Promise<void> {
        const newApiUserId = await this.resolveQueryNewApiUserId(args[1], client, data, '查询用户信息');
        if (!newApiUserId) return;

        try {
            const info = await getNewApiUserInfo(newApiUserId);
            await reply(client, data, formatNewApiUserInfo(info));
        } catch (error) {
            await reply(client, data, `查询失败：${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    private async handleModels(client: NapLink, data: AllMessageEvent): Promise<void> {
        try {
            const models = await getNewApiEnabledModels();
            await reply(client, data, formatNewApiModels(models));
        } catch (error) {
            await reply(client, data, `查询失败：${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    private async handlePlans(client: NapLink, data: AllMessageEvent): Promise<void> {
        try {
            const plans = await getNewApiPlans();
            await reply(client, data, formatNewApiPlans(plans));
        } catch (error) {
            await reply(client, data, `查询失败：${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    private async handlePlan(args: string[], client: NapLink, data: AllMessageEvent): Promise<void> {
        if (args[0] === 'list') {
            await this.handlePlans(client, data);
            return;
        }

        if (args[0] === 'query') {
            await this.handleQueryPlan(args[1], client, data);
            return;
        }

        if (args[0] === 'add') {
            await this.handleAddPlan(args[1], Number(args[2]), client, data);
            return;
        }

        if (args[0] === 'delete') {
            await this.handleDeletePlan(Number(args[1]), client, data);
            return;
        }

        await this.handleInvalidatePlan(Number(args[1]), client, data);
    }

    private async handleQueryPlan(target: string | undefined, client: NapLink, data: AllMessageEvent): Promise<void> {
        const newApiUserId = await this.resolveQueryNewApiUserId(target, client, data, '查询套餐');
        if (!newApiUserId) return;

        try {
            const [subscriptions, plans] = await Promise.all([
                getNewApiUserSubscriptions(newApiUserId),
                getNewApiPlans()
            ]);
            await reply(client, data, formatNewApiSubscriptions(subscriptions, plans));
        } catch (error) {
            await reply(client, data, `查询失败：${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    private async handleAddPlan(target: string, planId: number, client: NapLink, data: AllMessageEvent): Promise<void> {
        if (!(await this.requireSuperUser(client, data))) return;

        let newApiUserId: number;
        let targetLabel: string;

        if (isValidPositiveId(target)) {
            newApiUserId = Number(target);
            targetLabel = `NewAPI 用户 ${newApiUserId}`;
        } else {
            const targetUserId = getUserId(target);
            if (!targetUserId) {
                await reply(client, data, '目标用户无效，请使用 /newapi plan add <NewAPI用户ID/@用户> <套餐ID>。');
                return;
            }

            const binding = await this.getBindingByUserId(targetUserId);
            if (!binding) {
                await reply(client, data, `用户 ${targetUserId} 还没有绑定 NewAPI 用户 ID，无法加套餐。`);
                return;
            }

            newApiUserId = binding.newApiUserId;
            targetLabel = `QQ 用户 ${targetUserId} 绑定的 NewAPI 用户 ${newApiUserId}`;
        }

        try {
            await createNewApiUserSubscription(newApiUserId, planId);
            await reply(client, data, `已为 ${targetLabel} 新增套餐 ${planId}。`);
        } catch (error) {
            await reply(client, data, `新增失败：${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    private async handleDeletePlan(subscriptionId: number, client: NapLink, data: AllMessageEvent): Promise<void> {
        if (!(await this.requireSuperUser(client, data))) return;

        try {
            await deleteNewApiUserSubscription(subscriptionId);
            await reply(client, data, `已删除订阅 ${subscriptionId}。`);
        } catch (error) {
            await reply(client, data, `删除失败：${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    private async handleInvalidatePlan(subscriptionId: number, client: NapLink, data: AllMessageEvent): Promise<void> {
        if (!(await this.requireSuperUser(client, data))) return;

        try {
            await invalidateNewApiUserSubscription(subscriptionId);
            await reply(client, data, `已作废订阅 ${subscriptionId}。`);
        } catch (error) {
            await reply(client, data, `作废失败：${error instanceof Error ? error.message : '未知错误'}`);
        }
    }
}
