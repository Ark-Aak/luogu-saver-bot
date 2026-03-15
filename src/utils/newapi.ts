import axios from 'axios';
import { config } from '@/config';

const DEFAULT_QUOTA_PER_USD = 500_000;

function resolveAccessToken(): string {
    const token = config.saver.newApiAccessToken || config.saver.token;
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
        Authorization: `Bearer ${resolveAccessToken()}`,
        ...(config.saver.newApiUserId > 0 ? { 'New-Api-User': String(config.saver.newApiUserId) } : {})
    };
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

