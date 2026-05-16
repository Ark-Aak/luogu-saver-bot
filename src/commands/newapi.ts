import { NapLink } from '@naplink/naplink';
import { OneBotV11 } from '@onebots/protocol-onebot-v11/lib';
import { AllMessageEvent, Command, CommandScope } from '@/types';
import { reply } from '@/utils/client';
import {
    createNewApiUserSubscription,
    deleteNewApiUserSubscription,
    formatNewApiModels,
    formatNewApiPlans,
    formatNewApiSubscriptions,
    formatNewApiUserSearchResults,
    formatNewApiUserInfo,
    getNewApiEnabledModels,
    getNewApiPlans,
    getNewApiUserInfo,
    getNewApiUserSubscriptions,
    invalidateNewApiUserSubscription,
    searchNewApiUsers
} from '@/utils/newapi';
import { isSuperUser } from '@/utils/permission';
import { isValidPositiveId, isValidUser, isValidVerificationCode } from '@/utils/validator';
import { maskEmail } from '@/utils/email';
import {
    composeArgNormalizers,
    normalizeConditionalUserTargets,
    normalizeSubcommandUserTargets
} from '@/utils/command-args';
import { EmailVerificationStore, sendVerificationEmail } from '@/utils/email-verification';
import { getErrorMessage } from '@/utils/error';
import { getNewApiBindingByUserId, upsertNewApiBinding } from '@/utils/newapi-bindings';
import { isLikelyQqId } from '@/utils/user-target';
import {
    consumeNewApiPlanRedemption,
    getNewApiPlanRedemptionCount,
    getNewApiPlanRedemptions,
    grantNewApiPlanRedemptions
} from '@/utils/newapi-plan-redemptions';

type NewApiVerification = {
    newApiUserId: number;
};

type NewApiTargetResolution = {
    newApiUserId: number | null;
    qqUserId: number | null;
    targetLabel: string | null;
    errorMessage: string | null;
};

export class NewApiCommand implements Command<AllMessageEvent> {
    name = 'newapi';
    aliases = ['额度'];
    description = '绑定 NewAPI 用户 ID 并查询额度。';
    usage = {
        bind: '/newapi bind <NewAPI 用户 ID> [QQ 号/@用户]（指定用户需超级管理员）\n/newapi bind query [QQ 号/@用户]（查询他人需超级管理员）',
        verify: '/newapi verify <6 位验证码>',
        models: '/newapi models',
        user: {
            query: '/newapi user query [NewAPI 用户 ID/QQ 号/@用户]',
            search: '/newapi user search <关键词>'
        },
        plan: {
            list: '/newapi plan list',
            query: '/newapi plan query [NewAPI 用户 ID/QQ 号/@用户]',
            add: '/newapi plan add <NewAPI 用户 ID/@用户> <套餐 ID>',
            grant: '/newapi plan grant <套餐 ID> <次数> <QQ 号/@用户>',
            redeem: '/newapi plan redeem <套餐 ID>',
            balance: '/newapi plan balance',
            delete: '/newapi plan delete <订阅 ID>',
            revoke: '/newapi plan revoke <订阅 ID>'
        }
    };
    scope: CommandScope = 'both';
    normalizeArgs = composeArgNormalizers(
        normalizeSubcommandUserTargets('bind', { 3: [2] }),
        normalizeConditionalUserTargets(args => args[0] === 'user' && args[1] === 'query', 2),
        normalizeConditionalUserTargets(args => args[0] === 'plan' && ['query', 'add'].includes(args[1]), 2),
        normalizeConditionalUserTargets(args => args[0] === 'plan' && args[1] === 'grant', 4)
    );

    private verificationStore = new EmailVerificationStore<NewApiVerification>();

    validateArgs(args: string[]): boolean {
        if (args.length === 1 && args[0] === 'models') return true;
        if (args.length === 2 && args[0] === 'bind' && args[1] === 'query') return true;
        if (args.length === 2 && args[0] === 'bind') return isValidPositiveId(args[1]);
        if (args.length === 3 && args[0] === 'bind' && args[1] === 'query') return isValidUser(args[2]);
        if (args.length === 3 && args[0] === 'bind') return isValidPositiveId(args[1]) && isValidUser(args[2]);
        if (args.length === 2 && args[0] === 'verify') return isValidVerificationCode(args[1]);
        if (args.length === 2 && args[0] === 'user' && args[1] === 'query') return true;
        if (args.length === 3 && args[0] === 'user' && args[1] === 'query') return isValidUser(args[2]);
        if (args.length >= 3 && args[0] === 'user' && args[1] === 'search')
            return args.slice(2).join(' ').trim().length > 0;
        if (args.length === 2 && args[0] === 'plan' && ['list', 'query'].includes(args[1])) return true;
        if (args.length === 2 && args[0] === 'plan' && args[1] === 'balance') return true;
        if (args.length === 3 && args[0] === 'plan' && args[1] === 'query') return isValidUser(args[2]);
        if (args.length === 3 && args[0] === 'plan' && args[1] === 'redeem') return isValidPositiveId(args[2]);
        if (args.length === 3 && args[0] === 'plan' && ['delete', 'revoke'].includes(args[1])) {
            return isValidPositiveId(args[2]);
        }
        if (args.length === 4 && args[0] === 'plan' && args[1] === 'add') {
            return isValidUser(args[2]) && isValidPositiveId(args[3]);
        }
        if (args.length === 5 && args[0] === 'plan' && args[1] === 'grant') {
            return isValidPositiveId(args[2]) && isValidPositiveId(args[3]) && isValidUser(args[4]);
        }
        return false;
    }

    async execute(
        args: string[],
        client: NapLink,
        data: OneBotV11.GroupMessageEvent | OneBotV11.PrivateMessageEvent
    ): Promise<void> {
        if (args[0] === 'bind') {
            if (args[1] === 'query') {
                await this.handleBindQuery(args[2], client, data);
            } else if (args.length === 2) {
                await this.handleBind(Number(args[1]), client, data);
            } else {
                await this.handleAdminBind(Number(args[1]), args[2], client, data);
            }
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
        return getNewApiBindingByUserId(data.user_id);
    }

    private async getBindingByUserId(userId: number) {
        return getNewApiBindingByUserId(userId);
    }

    private async requireSuperUser(client: NapLink, data: AllMessageEvent): Promise<boolean> {
        if (isSuperUser(data.user_id)) return true;
        await reply(client, data, '权限不足，需要超级管理员权限。');
        return false;
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

            this.verificationStore.assertCanSend(data.user_id);
            const verification = this.verificationStore.create(data.user_id, info.email, { newApiUserId });
            await sendVerificationEmail(info.email, 'LGS-Bot NewAPI 绑定验证码', verification.code, 'NewAPI 绑定');
            this.verificationStore.markSent(data.user_id);

            await reply(
                client,
                data,
                `验证码已发送至 ${maskEmail(info.email)}。\n请查收并使用 /newapi verify <验证码> 完成绑定。\n验证码有效期为 10 分钟。`
            );
        } catch (error) {
            await reply(client, data, `绑定失败：${getErrorMessage(error)}`);
        }
    }

    private async handleAdminBind(
        newApiUserId: number,
        target: string,
        client: NapLink,
        data: AllMessageEvent
    ): Promise<void> {
        if (!(await this.requireSuperUser(client, data))) return;

        const targetUserId = Number(target);

        try {
            await upsertNewApiBinding(targetUserId, newApiUserId);
            await reply(client, data, `已将 QQ 用户 ${targetUserId} 绑定到 NewAPI 用户 ID: ${newApiUserId}。`);
        } catch (error) {
            await reply(client, data, `绑定失败：${getErrorMessage(error)}`);
        }
    }

    private async handleBindQuery(target: string | undefined, client: NapLink, data: AllMessageEvent): Promise<void> {
        const targetUserId = target ? Number(target) : data.user_id;
        if (target && !(await this.requireSuperUser(client, data))) return;

        const binding = await this.getBindingByUserId(targetUserId);
        if (!binding) {
            await reply(client, data, `QQ 用户 ${targetUserId} 还没有绑定 NewAPI 用户 ID。`);
            return;
        }

        await reply(client, data, `QQ 用户 ${targetUserId} 已绑定 NewAPI 用户 ID: ${binding.newApiUserId}。`);
    }

    private async handleVerify(code: string, client: NapLink, data: AllMessageEvent): Promise<void> {
        const verification = this.verificationStore.verify(data.user_id, code);
        if (!verification) {
            await reply(client, data, '验证码错误或已过期，请重新使用 /newapi bind <NewAPI用户ID> 获取验证码。');
            return;
        }

        try {
            await upsertNewApiBinding(data.user_id, verification.payload.newApiUserId);

            await reply(client, data, `已绑定 NewAPI 用户 ID: ${verification.payload.newApiUserId}。`);
        } catch (error) {
            await reply(client, data, `验证失败：${getErrorMessage(error)}`);
        }
    }

    private async resolveNewApiTarget(
        target: string | undefined,
        data: AllMessageEvent,
        action: string,
        options: { fallbackToNewApiId: boolean }
    ): Promise<NewApiTargetResolution> {
        if (!target) {
            const binding = await this.getBinding(data);
            if (!binding) {
                return {
                    newApiUserId: null,
                    qqUserId: data.user_id,
                    targetLabel: null,
                    errorMessage: '你还没有绑定 NewAPI 用户 ID，请先使用 /newapi bind <NewAPI用户ID>。'
                };
            }

            return {
                newApiUserId: binding.newApiUserId,
                qqUserId: data.user_id,
                targetLabel: `QQ 用户 ${data.user_id} 绑定的 NewAPI 用户 ${binding.newApiUserId}`,
                errorMessage: null
            };
        }

        const targetUserId = Number(target);
        const binding = await this.getBindingByUserId(targetUserId);
        if (binding) {
            return {
                newApiUserId: binding.newApiUserId,
                qqUserId: targetUserId,
                targetLabel: `QQ 用户 ${targetUserId} 绑定的 NewAPI 用户 ${binding.newApiUserId}`,
                errorMessage: null
            };
        }

        if (isLikelyQqId(target)) {
            return {
                newApiUserId: null,
                qqUserId: targetUserId,
                targetLabel: null,
                errorMessage: `用户 ${targetUserId} 还没有绑定 NewAPI 用户 ID，无法${action}。`
            };
        }

        if (options.fallbackToNewApiId && isValidPositiveId(target)) {
            return {
                newApiUserId: Number(target),
                qqUserId: null,
                targetLabel: `NewAPI 用户 ${target}`,
                errorMessage: null
            };
        }

        return {
            newApiUserId: null,
            qqUserId: targetUserId,
            targetLabel: null,
            errorMessage: `用户 ${targetUserId} 还没有绑定 NewAPI 用户 ID，无法${action}。`
        };
    }

    private buildMissingTargetReply(resolution: NewApiTargetResolution): string {
        return resolution.errorMessage ?? '无法解析目标用户。';
    }

    private async handleUser(args: string[], client: NapLink, data: AllMessageEvent): Promise<void> {
        if (args[0] === 'search') {
            await this.handleUserSearch(args.slice(1).join(' '), client, data);
            return;
        }

        if (args[1] && !(await this.requireSuperUser(client, data))) return;

        const resolution = await this.resolveNewApiTarget(args[1], data, '查询用户信息', { fallbackToNewApiId: true });
        if (!resolution.newApiUserId) {
            await reply(client, data, this.buildMissingTargetReply(resolution));
            return;
        }

        try {
            const info = await getNewApiUserInfo(resolution.newApiUserId);
            await reply(client, data, formatNewApiUserInfo(info));
        } catch (error) {
            await reply(client, data, `查询失败：${getErrorMessage(error)}`);
        }
    }

    private async handleUserSearch(keyword: string, client: NapLink, data: AllMessageEvent): Promise<void> {
        try {
            const users = await searchNewApiUsers(keyword, 3);
            await reply(client, data, formatNewApiUserSearchResults(users));
        } catch (error) {
            await reply(client, data, `搜索失败：${getErrorMessage(error)}`);
        }
    }

    private async handleModels(client: NapLink, data: AllMessageEvent): Promise<void> {
        try {
            const models = await getNewApiEnabledModels();
            await reply(client, data, formatNewApiModels(models));
        } catch (error) {
            await reply(client, data, `查询失败：${getErrorMessage(error)}`);
        }
    }

    private async handlePlans(client: NapLink, data: AllMessageEvent): Promise<void> {
        try {
            const plans = await getNewApiPlans();
            await reply(client, data, formatNewApiPlans(plans));
        } catch (error) {
            await reply(client, data, `查询失败：${getErrorMessage(error)}`);
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

        if (args[0] === 'grant') {
            await this.handleGrantPlanRedemption(Number(args[1]), Number(args[2]), args[3], client, data);
            return;
        }

        if (args[0] === 'redeem') {
            await this.handleRedeemPlan(Number(args[1]), client, data);
            return;
        }

        if (args[0] === 'balance') {
            await this.handlePlanRedemptionBalance(client, data);
            return;
        }

        if (args[0] === 'delete') {
            await this.handleDeletePlan(Number(args[1]), client, data);
            return;
        }

        await this.handleInvalidatePlan(Number(args[1]), client, data);
    }

    private async handleQueryPlan(target: string | undefined, client: NapLink, data: AllMessageEvent): Promise<void> {
        if (target && !(await this.requireSuperUser(client, data))) return;

        const resolution = await this.resolveNewApiTarget(target, data, '查询套餐', { fallbackToNewApiId: true });
        if (!resolution.newApiUserId) {
            await reply(client, data, this.buildMissingTargetReply(resolution));
            return;
        }

        try {
            const [subscriptions, plans] = await Promise.all([
                getNewApiUserSubscriptions(resolution.newApiUserId),
                getNewApiPlans()
            ]);
            await reply(client, data, formatNewApiSubscriptions(subscriptions, plans));
        } catch (error) {
            await reply(client, data, `查询失败：${getErrorMessage(error)}`);
        }
    }

    private async handleAddPlan(target: string, planId: number, client: NapLink, data: AllMessageEvent): Promise<void> {
        if (!(await this.requireSuperUser(client, data))) return;

        const resolution = await this.resolveNewApiTarget(target, data, '加套餐', { fallbackToNewApiId: true });
        if (!resolution.newApiUserId) {
            await reply(client, data, this.buildMissingTargetReply(resolution));
            return;
        }

        try {
            await createNewApiUserSubscription(resolution.newApiUserId, planId);
            await reply(client, data, `已为 ${resolution.targetLabel} 新增套餐 ${planId}。`);
        } catch (error) {
            await reply(client, data, `新增失败：${getErrorMessage(error)}`);
        }
    }

    private async handleGrantPlanRedemption(
        planId: number,
        count: number,
        target: string,
        client: NapLink,
        data: AllMessageEvent
    ): Promise<void> {
        if (!(await this.requireSuperUser(client, data))) return;

        const targetUserId = Number(target);
        try {
            const newCount = await grantNewApiPlanRedemptions(targetUserId, planId, count);
            await reply(
                client,
                data,
                `已向 QQ 用户 ${targetUserId} 发放套餐 ${planId} 兑换次数 ${count} 次，当前剩余 ${newCount} 次。`
            );
        } catch (error) {
            await reply(client, data, `发放失败：${getErrorMessage(error)}`);
        }
    }

    private async handleRedeemPlan(planId: number, client: NapLink, data: AllMessageEvent): Promise<void> {
        const binding = await this.getBinding(data);
        if (!binding) {
            await reply(client, data, '你还没有绑定 NewAPI 用户 ID，请先使用 /newapi bind <NewAPI用户ID>。');
            return;
        }

        try {
            const currentCount = await getNewApiPlanRedemptionCount(data.user_id, planId);
            if (currentCount <= 0) {
                throw new Error('没有可用的套餐兑换次数。');
            }

            await createNewApiUserSubscription(binding.newApiUserId, planId);
            const remainingCount = await consumeNewApiPlanRedemption(data.user_id, planId);
            await reply(client, data, `已兑换套餐 ${planId}，剩余兑换次数 ${remainingCount} 次。`);
        } catch (error) {
            await reply(client, data, `兑换失败：${getErrorMessage(error)}`);
        }
    }

    private async handlePlanRedemptionBalance(client: NapLink, data: AllMessageEvent): Promise<void> {
        const balances = await getNewApiPlanRedemptions(data.user_id);
        const availableBalances = balances.filter(balance => balance.count > 0);
        if (availableBalances.length === 0) {
            await reply(client, data, '你当前没有可用的套餐兑换次数。');
            return;
        }

        const plans = await getNewApiPlans();
        const planMap = new Map(plans.map(plan => [plan.id, plan]));
        await reply(
            client,
            data,
            [
                'NewAPI 套餐兑换次数',
                ...availableBalances.map(balance => {
                    const plan = planMap.get(balance.planId);
                    return `套餐 ${balance.planId}${plan ? `（${plan.title}）` : ''}: ${balance.count} 次`;
                })
            ].join('\n')
        );
    }

    private async handleDeletePlan(subscriptionId: number, client: NapLink, data: AllMessageEvent): Promise<void> {
        if (!(await this.requireSuperUser(client, data))) return;

        try {
            await deleteNewApiUserSubscription(subscriptionId);
            await reply(client, data, `已删除订阅 ${subscriptionId}。`);
        } catch (error) {
            await reply(client, data, `删除失败：${getErrorMessage(error)}`);
        }
    }

    private async handleInvalidatePlan(subscriptionId: number, client: NapLink, data: AllMessageEvent): Promise<void> {
        if (!(await this.requireSuperUser(client, data))) return;

        try {
            await invalidateNewApiUserSubscription(subscriptionId);
            await reply(client, data, `已作废订阅 ${subscriptionId}。`);
        } catch (error) {
            await reply(client, data, `作废失败：${getErrorMessage(error)}`);
        }
    }
}
