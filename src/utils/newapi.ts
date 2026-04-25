import axios from 'axios';
import { config } from '@/config';
import { toNumber, toString } from '@/utils/cast';

const DEFAULT_QUOTA_PER_USD = 500_000;

export type NewApiUserInfo = {
    id: number;
    username: string;
    displayName: string;
    email: string;
    quota: number;
    usedQuota: number;
    requestCount: number;
    group: string;
};

export type NewApiSubscriptionPlan = {
    id: number;
    title: string;
    subtitle: string;
    priceAmount: number;
    currency: string;
    durationUnit: string;
    durationValue: number;
    enabled: boolean;
    upgradeGroup: string;
    totalAmount: number;
    quotaResetPeriod: string;
};

export type NewApiUserSubscription = {
    id: number;
    userId: number;
    planId: number;
    amountTotal: number;
    amountUsed: number;
    startTime: number;
    endTime: number;
    status: string;
    source: string;
    nextResetTime: number;
    upgradeGroup: string;
};

function resolveAccessToken(): string {
    const token = config.saver.newApiAccessToken;
    if (!token) {
        throw new Error('未配置 NewAPI 访问令牌，请检查 saver.newApiAccessToken。');
    }
    return token.startsWith('Bearer ') ? token.slice(7) : token;
}

function resolveApiUrl(path: string): string {
    const base = config.saver.newApiBaseUrl.replace(/\/$/, '');
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${base}${normalizedPath}`;
}

function extractApiErrorMessage(data: unknown): string | null {
    if (!data || typeof data !== 'object') {
        return null;
    }
    const maybe = data as Record<string, unknown>;
    const message = maybe.message;
    if (typeof message === 'string' && message.trim()) {
        return message;
    }
    const error = maybe.error;
    if (typeof error === 'string' && error.trim()) {
        return error;
    }
    return null;
}

function buildAdminHeaders() {
    return {
        Authorization: `${resolveAccessToken()}`,
        ...(config.saver.newApiUserId > 0 ? { 'New-Api-User': String(config.saver.newApiUserId) } : {})
    };
}

function extractUserInfo(data: unknown): NewApiUserInfo | null {
    if (!data || typeof data !== 'object') {
        return null;
    }

    const record = data as Record<string, unknown>;
    const payload = record.data;
    if (!payload || typeof payload !== 'object') {
        return null;
    }

    const user = payload as Record<string, unknown>;
    const id = toNumber(user.id);
    if (id <= 0) {
        return null;
    }

    return {
        id,
        username: toString(user.username),
        displayName: toString(user.display_name),
        email: toString(user.email),
        quota: toNumber(user.quota),
        usedQuota: toNumber(user.used_quota),
        requestCount: toNumber(user.request_count),
        group: toString(user.group)
    };
}

export function quotaToUsd(quota: number): number {
    return quota / DEFAULT_QUOTA_PER_USD;
}

export function formatQuotaUsd(quota: number): string {
    return quotaToUsd(quota).toFixed(2);
}

export function formatNewApiUserInfo(info: NewApiUserInfo): string {
    const remainingQuota = Math.max(0, info.quota - info.usedQuota);
    return [
        'NewAPI 用户信息',
        `用户名: ${info.username || '-'}`,
        `用户组: ${info.group || '-'}`,
        `剩余额度: $${formatQuotaUsd(remainingQuota)}`,
        `总额度: $${formatQuotaUsd(info.quota)}`,
        `已用额度: $${formatQuotaUsd(info.usedQuota)}`
    ].join('\n');
}

function extractStringArray(data: unknown): string[] | null {
    if (!data || typeof data !== 'object') {
        return null;
    }

    const payload = (data as Record<string, unknown>).data;
    if (!Array.isArray(payload)) {
        return null;
    }

    return payload
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .sort((a, b) => a.localeCompare(b));
}

function formatTimestamp(timestamp: number): string {
    if (timestamp <= 0) return '-';
    return new Date(timestamp * 1000).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
}

function formatDuration(unit: string, value: number): string {
    const unitText: Record<string, string> = {
        day: '天',
        month: '月',
        year: '年',
        hour: '小时',
        minute: '分钟',
        second: '秒'
    };
    return `${value}${unitText[unit] ?? unit}`;
}

function extractPlans(data: unknown): NewApiSubscriptionPlan[] | null {
    if (!data || typeof data !== 'object') return null;
    const payload = (data as Record<string, unknown>).data;
    if (!Array.isArray(payload)) return null;

    return payload
        .map(item => {
            if (!item || typeof item !== 'object') return null;
            const plan = (item as Record<string, unknown>).plan;
            if (!plan || typeof plan !== 'object') return null;

            const record = plan as Record<string, unknown>;
            const id = toNumber(record.id);
            if (id <= 0) return null;

            return {
                id,
                title: toString(record.title),
                subtitle: toString(record.subtitle),
                priceAmount: toNumber(record.price_amount),
                currency: toString(record.currency),
                durationUnit: toString(record.duration_unit),
                durationValue: toNumber(record.duration_value),
                enabled: record.enabled === true,
                upgradeGroup: toString(record.upgrade_group),
                totalAmount: toNumber(record.total_amount),
                quotaResetPeriod: toString(record.quota_reset_period)
            } satisfies NewApiSubscriptionPlan;
        })
        .filter((plan): plan is NewApiSubscriptionPlan => plan !== null);
}

function extractSubscriptions(data: unknown): NewApiUserSubscription[] | null {
    if (!data || typeof data !== 'object') return null;
    const payload = (data as Record<string, unknown>).data;
    if (!Array.isArray(payload)) return null;

    return payload
        .map(item => {
            if (!item || typeof item !== 'object') return null;
            const subscription = (item as Record<string, unknown>).subscription;
            if (!subscription || typeof subscription !== 'object') return null;

            const record = subscription as Record<string, unknown>;
            const id = toNumber(record.id);
            if (id <= 0) return null;

            return {
                id,
                userId: toNumber(record.user_id),
                planId: toNumber(record.plan_id),
                amountTotal: toNumber(record.amount_total),
                amountUsed: toNumber(record.amount_used),
                startTime: toNumber(record.start_time),
                endTime: toNumber(record.end_time),
                status: toString(record.status),
                source: toString(record.source),
                nextResetTime: toNumber(record.next_reset_time),
                upgradeGroup: toString(record.upgrade_group)
            } satisfies NewApiUserSubscription;
        })
        .filter((subscription): subscription is NewApiUserSubscription => subscription !== null);
}

export function formatNewApiModels(models: string[]): string {
    if (models.length === 0) {
        return '当前没有可用模型。';
    }

    return [`NewAPI 可用模型（${models.length} 个）`, ...models.map((model, index) => `${index + 1}. ${model}`)].join(
        '\n'
    );
}

function currencyToSymbol(currency: string) {
    switch (currency) {
        case 'USD':
            return '$';
        case 'CNY':
            return '¥';
        case 'EUR':
            return '€';
        default:
            return currency + ' ';
    }
}

export function formatNewApiPlans(originalPlans: NewApiSubscriptionPlan[], showDisabled = false): string {
    const plans = showDisabled ? originalPlans : originalPlans.filter(p => p.enabled);
    if (plans.length === 0) return '当前没有订阅套餐。';
    return [
        `NewAPI 订阅套餐（${plans.length} 个）`,
        ...plans.map(plan =>
            [
                `#${plan.id} ${plan.title} ${plan.enabled ? '' : '（已禁用）'}`.trim(),
                `价格: ${currencyToSymbol(plan.currency)}${plan.priceAmount} / ${formatDuration(plan.durationUnit, plan.durationValue)}`,
                `额度: $${formatQuotaUsd(plan.totalAmount)} / 重置: ${plan.quotaResetPeriod || '-'}`,
                `用户组: ${plan.upgradeGroup || '-'}`,
                plan.subtitle ? `说明: ${plan.subtitle}` : null
            ]
                .filter((line): line is string => line !== null)
                .join('\n')
        )
    ].join('\n\n');
}

export function formatNewApiSubscriptions(
    subscriptions: NewApiUserSubscription[],
    plans: NewApiSubscriptionPlan[] = []
): string {
    if (subscriptions.length === 0) return '当前没有订阅套餐。';

    const planMap = new Map(plans.map(plan => [plan.id, plan]));
    return [
        `NewAPI 订阅列表（${subscriptions.length} 个）`,
        ...subscriptions.map(subscription => {
            const plan = planMap.get(subscription.planId);
            return [
                `套餐: ${plan?.title ?? `#${subscription.planId}`}`,
                `订阅 ID: ${subscription.planId}`,
                `状态: ${subscription.status || '-'}`,
                `额度: $${formatQuotaUsd(Math.max(0, subscription.amountTotal - subscription.amountUsed))} / $${formatQuotaUsd(subscription.amountTotal)}`,
                `有效期: ${formatTimestamp(subscription.startTime)} - ${formatTimestamp(subscription.endTime)}`,
                `下次重置: ${formatTimestamp(subscription.nextResetTime)}`,
                `用户组: ${subscription.upgradeGroup || '-'}`
            ].join('\n');
        })
    ].join('\n\n');
}

function extractFirstRedemptionKey(data: unknown): string | null {
    if (!data || typeof data !== 'object') {
        return null;
    }

    const record = data as Record<string, unknown>;
    const payload = record.data;
    if (Array.isArray(payload)) {
        const first = payload[0];
        return typeof first === 'string' && first.trim() ? first : null;
    }

    if (payload && typeof payload === 'object') {
        const maybeKey = (payload as Record<string, unknown>).key;
        return typeof maybeKey === 'string' && maybeKey.trim() ? maybeKey : null;
    }

    return null;
}

export async function createRedemptionCodeByAdmin(amountUsd: number, name: string): Promise<string> {
    const quota = Math.round(amountUsd * DEFAULT_QUOTA_PER_USD);
    if (quota <= 0) {
        throw new Error('兑换额度无效。');
    }

    const response = await axios.post(
        resolveApiUrl('/api/redemption/'),
        {
            name: name.slice(0, 20),
            count: 1,
            quota
        },
        {
            headers: buildAdminHeaders()
        }
    );

    const apiErrorMessage = extractApiErrorMessage(response.data);
    const responseCode =
        response.data && typeof response.data === 'object' && 'code' in response.data
            ? (response.data as Record<string, unknown>).code
            : undefined;

    if (
        (typeof responseCode === 'number' && responseCode !== 200) ||
        (typeof responseCode === 'string' && responseCode !== '200')
    ) {
        throw new Error(apiErrorMessage ?? `兑换码接口返回失败 code=${String(responseCode)}`);
    }

    if (response.data && typeof response.data === 'object' && 'success' in response.data) {
        const success = (response.data as Record<string, unknown>).success;
        if (success === false) {
            throw new Error(apiErrorMessage ?? '兑换码接口返回 success=false');
        }
    }

    const redemptionCode = extractFirstRedemptionKey(response.data);
    if (!redemptionCode) {
        throw new Error('兑换码创建成功，但未从接口响应中解析到兑换码。');
    }

    return redemptionCode;
}

export async function getNewApiUserInfo(userId: number): Promise<NewApiUserInfo> {
    if (!Number.isInteger(userId) || userId <= 0) {
        throw new Error('NewAPI 用户 ID 无效。');
    }

    const response = await axios.get(resolveApiUrl(`/api/user/${userId}`), {
        headers: buildAdminHeaders()
    });

    const apiErrorMessage = extractApiErrorMessage(response.data);
    if (response.data && typeof response.data === 'object' && 'success' in response.data) {
        const success = (response.data as Record<string, unknown>).success;
        if (success === false) {
            throw new Error(apiErrorMessage ?? '用户信息接口返回 success=false');
        }
    }

    const userInfo = extractUserInfo(response.data);
    if (!userInfo) {
        throw new Error('未从接口响应中解析到用户信息。');
    }

    return userInfo;
}

export async function getNewApiEnabledModels(): Promise<string[]> {
    const response = await axios.get(resolveApiUrl('/api/channel/models_enabled'), {
        headers: buildAdminHeaders()
    });

    const apiErrorMessage = extractApiErrorMessage(response.data);
    if (response.data && typeof response.data === 'object' && 'success' in response.data) {
        const success = (response.data as Record<string, unknown>).success;
        if (success === false) {
            throw new Error(apiErrorMessage ?? '模型列表接口返回 success=false');
        }
    }

    const models = extractStringArray(response.data);
    if (!models) {
        throw new Error('未从接口响应中解析到模型列表。');
    }

    return models;
}

export async function getNewApiPlans(): Promise<NewApiSubscriptionPlan[]> {
    const response = await axios.get(resolveApiUrl('/api/subscription/admin/plans'), {
        headers: buildAdminHeaders()
    });

    const apiErrorMessage = extractApiErrorMessage(response.data);
    if (response.data && typeof response.data === 'object' && 'success' in response.data) {
        const success = (response.data as Record<string, unknown>).success;
        if (success === false) {
            throw new Error(apiErrorMessage ?? '订阅套餐接口返回 success=false');
        }
    }

    const plans = extractPlans(response.data);
    if (!plans) {
        throw new Error('未从接口响应中解析到订阅套餐。');
    }

    return plans;
}

export async function getNewApiUserSubscriptions(userId: number): Promise<NewApiUserSubscription[]> {
    if (!Number.isInteger(userId) || userId <= 0) {
        throw new Error('NewAPI 用户 ID 无效。');
    }

    const response = await axios.get(resolveApiUrl(`/api/subscription/admin/users/${userId}/subscriptions`), {
        headers: buildAdminHeaders()
    });

    const apiErrorMessage = extractApiErrorMessage(response.data);
    if (response.data && typeof response.data === 'object' && 'success' in response.data) {
        const success = (response.data as Record<string, unknown>).success;
        if (success === false) {
            throw new Error(apiErrorMessage ?? '用户订阅接口返回 success=false');
        }
    }

    const subscriptions = extractSubscriptions(response.data);
    if (!subscriptions) {
        throw new Error('未从接口响应中解析到用户订阅。');
    }

    return subscriptions;
}

export async function createNewApiUserSubscription(userId: number, planId: number): Promise<void> {
    if (!Number.isInteger(userId) || userId <= 0 || !Number.isInteger(planId) || planId <= 0) {
        throw new Error('用户 ID 或套餐 ID 无效。');
    }

    const response = await axios.post(
        resolveApiUrl(`/api/subscription/admin/users/${userId}/subscriptions`),
        { plan_id: planId },
        { headers: buildAdminHeaders() }
    );

    const apiErrorMessage = extractApiErrorMessage(response.data);
    if (response.data && typeof response.data === 'object' && 'success' in response.data) {
        const success = (response.data as Record<string, unknown>).success;
        if (success === false) {
            throw new Error(apiErrorMessage ?? '新增订阅接口返回 success=false');
        }
    }
}

export async function deleteNewApiUserSubscription(subscriptionId: number): Promise<void> {
    if (!Number.isInteger(subscriptionId) || subscriptionId <= 0) {
        throw new Error('订阅 ID 无效。');
    }

    const response = await axios.delete(resolveApiUrl(`/api/subscription/admin/user_subscriptions/${subscriptionId}`), {
        headers: buildAdminHeaders()
    });

    const apiErrorMessage = extractApiErrorMessage(response.data);
    if (response.data && typeof response.data === 'object' && 'success' in response.data) {
        const success = (response.data as Record<string, unknown>).success;
        if (success === false) {
            throw new Error(apiErrorMessage ?? '删除订阅接口返回 success=false');
        }
    }
}

export async function invalidateNewApiUserSubscription(subscriptionId: number): Promise<void> {
    if (!Number.isInteger(subscriptionId) || subscriptionId <= 0) {
        throw new Error('订阅 ID 无效。');
    }

    const response = await axios.post(
        resolveApiUrl(`/api/subscription/admin/user_subscriptions/${subscriptionId}/invalidate`),
        {},
        { headers: buildAdminHeaders() }
    );

    const apiErrorMessage = extractApiErrorMessage(response.data);
    if (response.data && typeof response.data === 'object' && 'success' in response.data) {
        const success = (response.data as Record<string, unknown>).success;
        if (success === false) {
            throw new Error(apiErrorMessage ?? '作废订阅接口返回 success=false');
        }
    }
}
