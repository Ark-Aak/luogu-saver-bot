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
import { isValidPositiveId } from '@/utils/validator';

export class NewApiCommand implements Command<AllMessageEvent> {
    name = 'newapi';
    aliases = ['额度'];
    description = '绑定 NewAPI 用户 ID 并查询额度。';
    usage = {
        bind: '/newapi bind <NewAPI用户ID>',
        me: '/newapi me',
        models: '/newapi models',
        plans: '/newapi plans',
        myplan: '/newapi myplan',
        addplan: '/newapi addplan <NewAPI用户ID> <套餐ID>',
        delplan: '/newapi delplan <订阅ID>',
        invalidate: '/newapi invalidate <订阅ID>'
    };
    scope: CommandScope = 'both';

    validateArgs(args: string[]): boolean {
        if (args.length === 1 && ['me', 'models', 'plans', 'myplan'].includes(args[0])) return true;
        if (args.length === 2 && args[0] === 'bind') return isValidPositiveId(args[1]);
        if (args.length === 2 && (args[0] === 'delplan' || args[0] === 'invalidate')) return isValidPositiveId(args[1]);
        if (args.length === 3 && args[0] === 'addplan') return isValidPositiveId(args[1]) && isValidPositiveId(args[2]);
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

        if (args[0] === 'models') {
            await this.handleModels(client, data);
            return;
        }

        if (args[0] === 'plans') {
            await this.handlePlans(client, data);
            return;
        }

        if (args[0] === 'myplan') {
            await this.handleMyPlan(client, data);
            return;
        }

        if (args[0] === 'addplan') {
            await this.handleAddPlan(Number(args[1]), Number(args[2]), client, data);
            return;
        }

        if (args[0] === 'delplan') {
            await this.handleDeletePlan(Number(args[1]), client, data);
            return;
        }

        if (args[0] === 'invalidate') {
            await this.handleInvalidatePlan(Number(args[1]), client, data);
            return;
        }

        await this.handleMe(client, data);
    }

    private async getBinding(data: AllMessageEvent) {
        return db.query.newApiBindings.findFirst({
            where: eq(newApiBindings.userId, data.user_id)
        });
    }

    private async requireSuperUser(client: NapLink, data: AllMessageEvent): Promise<boolean> {
        if (isSuperUser(data.user_id)) return true;
        await reply(client, data, '权限不足，需要超级管理员权限。');
        return false;
    }

    private async handleBind(newApiUserId: number, client: NapLink, data: AllMessageEvent): Promise<void> {
        try {
            const info = await getNewApiUserInfo(newApiUserId);
            await db
                .insert(newApiBindings)
                .values({
                    userId: data.user_id,
                    newApiUserId,
                    updatedAt: Date.now()
                })
                .onConflictDoUpdate({
                    target: newApiBindings.userId,
                    set: {
                        newApiUserId,
                        updatedAt: Date.now()
                    }
                });

            await reply(client, data, `已绑定 NewAPI 用户 ID: ${newApiUserId}。\n${formatNewApiUserInfo(info)}`);
        } catch (error) {
            await reply(client, data, `绑定失败：${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    private async handleMe(client: NapLink, data: AllMessageEvent): Promise<void> {
        const binding = await this.getBinding(data);

        if (!binding) {
            await reply(client, data, '你还没有绑定 NewAPI 用户 ID，请先使用 /newapi bind <NewAPI用户ID>。');
            return;
        }

        try {
            const info = await getNewApiUserInfo(binding.newApiUserId);
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

    private async handleMyPlan(client: NapLink, data: AllMessageEvent): Promise<void> {
        const binding = await this.getBinding(data);
        if (!binding) {
            await reply(client, data, '你还没有绑定 NewAPI 用户 ID，请先使用 /newapi bind <NewAPI用户ID>。');
            return;
        }

        try {
            const [subscriptions, plans] = await Promise.all([
                getNewApiUserSubscriptions(binding.newApiUserId),
                getNewApiPlans()
            ]);
            await reply(client, data, formatNewApiSubscriptions(subscriptions, plans));
        } catch (error) {
            await reply(client, data, `查询失败：${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    private async handleAddPlan(
        newApiUserId: number,
        planId: number,
        client: NapLink,
        data: AllMessageEvent
    ): Promise<void> {
        if (!(await this.requireSuperUser(client, data))) return;

        try {
            await createNewApiUserSubscription(newApiUserId, planId);
            await reply(client, data, `已为 NewAPI 用户 ${newApiUserId} 新增套餐 ${planId}。`);
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
