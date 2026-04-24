import axios from 'axios';
import { config } from '@/config';
import { toNumber, toString } from '@/utils/cast';

const DEFAULT_QUOTA_PER_USD = 500_000;

export type NewApiUserInfo = {
    id: number;
    username: string;
    displayName: string;
    quota: number;
    usedQuota: number;
    requestCount: number;
    group: string;
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
        `ID: ${info.id}`,
        `用户名: ${info.username || '-'}`,
        `显示名: ${info.displayName || '-'}`,
        `用户组: ${info.group || '-'}`,
        `请求次数: ${info.requestCount}`,
        `剩余额度: $${formatQuotaUsd(remainingQuota)}`,
        `总额度: $${formatQuotaUsd(info.quota)}`,
        `已用额度: $${formatQuotaUsd(info.usedQuota)}`
    ].join('\n');
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
